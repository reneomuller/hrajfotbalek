import type { SupabaseClient } from "@supabase/supabase-js";
import type { CancelledRecipient } from "@/lib/email/dispatch";
import type { Database } from "@/lib/types/database";

/**
 * Who to mail after `cancel_game`, assembled from the events it just wrote.
 *
 * DRIVEN BY THE EVENT LOG, NOT BY A SECOND QUERY OF THE BOOKINGS. The RPC
 * cancelled a specific set of bookings inside one transaction and wrote a
 * `booking_cancelled` row for each with `source = 'game_cancelled'`. Re-deriving
 * the recipient set from `bookings` afterwards would answer a slightly
 * different question — "who is cancelled now" rather than "who did this
 * transaction cancel" — and the two differ for anyone cancelled a minute
 * earlier by their own hand.
 *
 * Extracted from the Phase 18 action so the same assembly is exercised by
 * `scripts/verify-cancel-email.check.ts`. A harness that rebuilt the recipient
 * list itself would be evidence about the harness.
 *
 * Needs the service-role client: it reads other players' emails, which no
 * admin session can see through RLS.
 */
export async function collectCancelledRecipients(
  service: SupabaseClient<Database>,
  gameId: string,
): Promise<CancelledRecipient[]> {
  const { data: events } = await service
    .from("events")
    .select("booking_id, player_id, metadata")
    .eq("game_id", gameId)
    .eq("event_type", "booking_cancelled");

  const affected = (events ?? []).filter(
    (row) => (row.metadata as { source?: string } | null)?.source === "game_cancelled",
  );

  const playerIds = [...new Set(affected.map((row) => row.player_id).filter(Boolean))];
  if (playerIds.length === 0) return [];

  const { data: players } = await service
    .from("players")
    .select("id, email, nickname")
    .in("id", playerIds as string[]);

  const byId = new Map((players ?? []).map((player) => [player.id, player]));

  return affected.map((row) => {
    const player = byId.get(row.player_id as string);
    const credit = Number(
      (row.metadata as { credit_issued_czk?: number } | null)?.credit_issued_czk ?? 0,
    );
    return {
      bookingId: row.booking_id as string,
      email: player?.email ?? null,
      nickname: player?.nickname ?? "",
      creditCzk: credit,
    };
  });
}
