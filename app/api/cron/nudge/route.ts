import { NextResponse } from "next/server";
import { bookingEmailContext } from "@/lib/cron/context";
import { rejectUnauthorizedCron } from "@/lib/cron/guard";
import { dispatchEmail } from "@/lib/email/dispatch";
import { policy } from "@/lib/policy";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";

export const dynamic = "force-dynamic";

/**
 * Scarcity nudge — every 30 minutes.
 *
 * SCARCITY IS THE WHOLE JUSTIFICATION. Only games that are `full` AND have at
 * least one person waiting are swept: with nobody waiting there is no reason
 * to pressure a player who is holding a spot nobody else wants.
 *
 * Cash reservations are nudged with no exemption — a cash promise holds a spot
 * exactly as an unpaid QR reservation does. Confirmed bookings are never
 * touched.
 *
 * One nudge per booking, ever. The `nudge_sent_at` column is the guard and it
 * is stamped inside `mark_nudged`, which returns false when it was already
 * set — so the email is sent only when this call did the stamping. There is no
 * `.update()` on `bookings` in this file.
 */
export async function GET(request: Request) {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) return unauthorized;

  const supabase = createServiceRoleSupabaseClient();

  const { data: fullGames, error: gamesError } = await supabase
    .from("games")
    .select("id, venue, starts_at")
    .eq("status", "full")
    .gt("starts_at", new Date().toISOString());

  if (gamesError) {
    return NextResponse.json({ error: gamesError.message }, { status: 500 });
  }

  let nudged = 0;
  let emails = 0;
  let scanned = 0;
  const gamesWithWaitlist: string[] = [];

  for (const game of fullGames ?? []) {
    const { count: waiting } = await supabase
      .from("waitlist")
      .select("id", { count: "exact", head: true })
      .eq("game_id", game.id)
      .is("converted_booking_id", null);

    if (!waiting || waiting < 1) continue;
    gamesWithWaitlist.push(game.id);

    const { data: bookings } = await supabase
      .from("bookings")
      .select("id, game_id, player_id, price_czk, credit_applied_czk")
      .eq("game_id", game.id)
      .eq("status", "reserved")
      .is("nudge_sent_at", null);

    for (const booking of bookings ?? []) {
      scanned += 1;

      const { data: stamped, error } = await supabase.rpc("mark_nudged", {
        p_booking_id: booking.id,
        p_grace_hours: policy.expiry.graceHoursAfterNudge,
      });

      // False means another sweep got there first, or the booking moved on.
      // Either way there is nothing to send.
      if (error || stamped !== true) continue;
      nudged += 1;

      const { data: player } = await supabase
        .from("players")
        .select("email, nickname")
        .eq("id", booking.player_id)
        .maybeSingle();

      if (!player) continue;

      const context = await bookingEmailContext(booking, game, player);
      const outcome = await dispatchEmail({
        event: "nudge_sent",
        to: player.email,
        context,
      });
      if (outcome.sent) emails += 1;
    }
  }

  return NextResponse.json({
    fullGames: fullGames?.length ?? 0,
    gamesWithWaitlist: gamesWithWaitlist.length,
    scanned,
    nudged,
    emails,
    graceHours: policy.expiry.graceHoursAfterNudge,
  });
}
