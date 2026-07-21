import { NextResponse } from "next/server";
import { bookingEmailContext } from "@/lib/cron/context";
import { rejectUnauthorizedCron } from "@/lib/cron/guard";
import { dispatchEmail } from "@/lib/email/dispatch";
import { notifyWaitlistForGame } from "@/lib/cron/waitlistRelease";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";

export const dynamic = "force-dynamic";

/**
 * Expiry sweep — every 15 minutes.
 *
 * Transitions `reserved` bookings past their `expires_at` to `expired` through
 * `expire_booking`, which emits `booking_expired` + `spot_released` in one
 * transaction. A freed spot then drives the waitlist fan-out.
 *
 * IDEMPOTENCY rests on the one-event-per-transition invariant inside
 * `expire_booking`: a booking already `expired` cannot be re-transitioned, so
 * a second sweep in the same window selects nothing and sends nothing. Vercel
 * Cron is at-least-once, and a retry that re-mails a player is exactly the
 * failure that erodes trust in an automated system.
 *
 * `expires_at` is null until a booking has been nudged, so an unpaid
 * reservation holds until game day by default and this sweep simply does not
 * see it. Confirmed bookings are never selected regardless of `expires_at` —
 * prepaying is spot insurance.
 */
export async function GET(request: Request) {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) return unauthorized;

  const supabase = createServiceRoleSupabaseClient();

  // Uses the (status, expires_at) index from Phase 4.
  const { data: due, error } = await supabase
    .from("bookings")
    .select("id, game_id, player_id, price_czk, credit_applied_czk")
    .eq("status", "reserved")
    .not("expires_at", "is", null)
    .lt("expires_at", new Date().toISOString());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const expired: string[] = [];
  const failed: string[] = [];
  const releasedGames = new Set<string>();
  let emails = 0;

  for (const booking of due ?? []) {
    const { error: rpcError } = await supabase.rpc("expire_booking", {
      p_booking_id: booking.id,
    });

    if (rpcError) {
      // A booking that raced to another status is not an error worth failing
      // the sweep over — the next run will simply not see it.
      failed.push(booking.id);
      continue;
    }

    expired.push(booking.id);
    releasedGames.add(booking.game_id);

    const [{ data: game }, { data: player }] = await Promise.all([
      supabase.from("games").select("id, venue, starts_at").eq("id", booking.game_id).maybeSingle(),
      supabase.from("players").select("email, nickname").eq("id", booking.player_id).maybeSingle(),
    ]);

    if (game && player) {
      const context = await bookingEmailContext(booking, game, player);
      const outcome = await dispatchEmail({
        event: "booking_expired",
        to: player.email,
        context,
      });
      if (outcome.sent) emails += 1;
    }
  }

  // A released spot is the whole point of expiring a booking: tell everyone
  // still waiting, all at once.
  let notified = 0;
  for (const gameId of releasedGames) {
    notified += await notifyWaitlistForGame(gameId);
  }

  return NextResponse.json({
    scanned: due?.length ?? 0,
    expired: expired.length,
    skipped: failed.length,
    expiryEmails: emails,
    gamesReleased: releasedGames.size,
    waitlistNotified: notified,
  });
}
