import { dispatchEmail } from "@/lib/email/dispatch";
import { siteUrl } from "@/lib/site";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";

/**
 * Waitlist spot-open fan-out for a game that just released a spot.
 *
 * THE STAMP IS THE RPC'S JOB, NOT THIS FILE'S. `notify_waitlist` updates every
 * `notified_at` and emits one `waitlist_notified` event per player inside one
 * transaction, then returns the players to mail. There is deliberately no
 * `.update()` on `waitlist` anywhere in the cron layer — a loop here updating
 * rows and emitting events beside them could leave the two disagreeing, and
 * the event log is what Phase 26 counts.
 *
 * The sends stay OUTSIDE the transaction. Mail is not transactional, and
 * holding a database transaction open across a network call to trade one
 * failure mode for a worse one is not a bargain.
 *
 * Everyone is notified simultaneously and the race is settled by
 * `create_booking`'s capacity check. A sequential offer-and-timeout queue
 * would leave the spot idle while waiting for someone to read their email.
 */
export async function notifyWaitlistForGame(gameId: string): Promise<number> {
  const supabase = createServiceRoleSupabaseClient();

  const { data: notified, error } = await supabase.rpc("notify_waitlist", {
    p_game_id: gameId,
  });

  if (error || !notified) return 0;

  const rows = notified as unknown as {
    player_id: string;
    email: string | null;
    nickname: string;
    waitlist_id: string;
  }[];

  if (rows.length === 0) return 0;

  const { data: game } = await supabase
    .from("games")
    .select("id, venue, starts_at")
    .eq("id", gameId)
    .maybeSingle();

  if (!game) return 0;

  const base = await siteUrl();
  let sent = 0;

  for (const row of rows) {
    const outcome = await dispatchEmail({
      event: "waitlist_notified",
      to: row.email,
      context: {
        nickname: row.nickname,
        venue: game.venue,
        startsAt: game.starts_at,
        gameUrl: `${base}/game/${game.id}`,
        accountUrl: `${base}/account`,
        convertUrl: `${base}/game/${game.id}/waitlist/convert`,
      },
    });
    if (outcome.sent) sent += 1;
  }

  return sent;
}
