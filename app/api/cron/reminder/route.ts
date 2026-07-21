import { NextResponse } from "next/server";
import { bookingEmailContext } from "@/lib/cron/context";
import { rejectUnauthorizedCron } from "@/lib/cron/guard";
import { dispatchEmail } from "@/lib/email/dispatch";
import { policy } from "@/lib/policy";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";

export const dynamic = "force-dynamic";

/**
 * 24h reminder — every 30 minutes.
 *
 * Goes to everyone holding an active spot on a game starting inside the
 * reminder window, paid or not: the reminder is about turning up, not about
 * money.
 *
 * One per booking ever, guarded by `reminder_sent_at` inside
 * `mark_reminder_sent`. The route stamps nothing itself.
 */
export async function GET(request: Request) {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) return unauthorized;

  const supabase = createServiceRoleSupabaseClient();

  const now = Date.now();
  const horizon = new Date(
    now + policy.reminder.hoursBeforeStart * 3600_000,
  ).toISOString();

  const { data: games, error } = await supabase
    .from("games")
    .select("id, venue, starts_at")
    .in("status", ["published", "full"])
    .gt("starts_at", new Date(now).toISOString())
    .lte("starts_at", horizon);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let reminded = 0;
  let emails = 0;
  let scanned = 0;

  for (const game of games ?? []) {
    const { data: bookings } = await supabase
      .from("bookings")
      .select("id, game_id, player_id, price_czk, credit_applied_czk")
      .eq("game_id", game.id)
      .in("status", ["reserved", "confirmed"])
      .is("reminder_sent_at", null);

    for (const booking of bookings ?? []) {
      scanned += 1;

      const { data: stamped, error: rpcError } = await supabase.rpc(
        "mark_reminder_sent",
        { p_booking_id: booking.id },
      );

      if (rpcError || stamped !== true) continue;
      reminded += 1;

      const { data: player } = await supabase
        .from("players")
        .select("email, nickname")
        .eq("id", booking.player_id)
        .maybeSingle();

      if (!player) continue;

      const context = await bookingEmailContext(booking, game, player, {
        withIcs: true,
      });
      const outcome = await dispatchEmail({
        event: "reminder_sent",
        to: player.email,
        context,
      });
      if (outcome.sent) emails += 1;
    }
  }

  return NextResponse.json({
    games: games?.length ?? 0,
    scanned,
    reminded,
    emails,
    windowHours: policy.reminder.hoursBeforeStart,
  });
}
