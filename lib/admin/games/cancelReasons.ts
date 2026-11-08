/**
 * Why each cancelled game was called off (round 42, the admin rebuild).
 *
 * `cancel_game_with_reason` does not store the reason on the game: it adds it
 * to the metadata of the `game_cancelled` event `cancel_game` just wrote, so
 * the log holds one cancellation per game rather than two. Reading it back is
 * therefore a read of the event log — this is the pure half, picking each
 * game's newest non-empty reason; `lib/admin/games/queries.ts` fetches the rows.
 *
 * A cancellation from before round 16 has no reason, and is simply absent.
 */
export interface CancelEventRow {
  game_id: string | null;
  created_at: string;
  metadata: unknown;
}

function reasonOf(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const reason = (metadata as Record<string, unknown>).reason;
  if (typeof reason !== "string") return null;
  const trimmed = reason.trim();
  return trimmed === "" ? null : trimmed;
}

export function latestCancelReasons(rows: readonly CancelEventRow[]): Map<string, string> {
  const newest = new Map<string, { at: number; reason: string }>();
  for (const row of rows) {
    const reason = reasonOf(row.metadata);
    if (!row.game_id || !reason) continue;
    const at = Date.parse(row.created_at);
    const held = newest.get(row.game_id);
    if (!held || at > held.at) newest.set(row.game_id, { at, reason });
  }
  return new Map([...newest].map(([gameId, { reason }]) => [gameId, reason]));
}
