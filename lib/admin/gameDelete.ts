import type { Database } from "@/lib/types/database";

type GameStatus = Database["public"]["Enums"]["game_status"];

/** Statuses that mean the game has happened, whatever the clock says. */
const PLAYED_STATUSES: ReadonlySet<GameStatus> = new Set<GameStatus>(["played", "settled"]);

/**
 * Whether deleting this game takes it out of players' stats and history
 * (round 39, item 1).
 *
 * A game that has kicked off — or been marked played or settled — is in the
 * history of everybody booked on it, and its bookings cascade away with it. The
 * admin's confirm says so for exactly these games. A cancelled game was never
 * counted for anyone, and an upcoming one has no history yet; `admin_delete_game`
 * refuses an upcoming game that still has players on it regardless.
 */
export function deleteErasesHistory(
  game: { status: GameStatus; starts_at: string },
  // The clock is read HERE rather than in the page: a render must stay pure,
  // and the page is force-dynamic, so every request reads it fresh.
  now: number = Date.now(),
): boolean {
  if (game.status === "cancelled") return false;
  if (PLAYED_STATUSES.has(game.status)) return true;
  return Date.parse(game.starts_at) <= now;
}
