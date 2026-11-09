import { hasFinished } from "@/lib/games/duration";
import type { BookingStatus, GameStatus } from "@/lib/types/database";

/**
 * What a player has PLAYED (round 42, the admin rebuild).
 *
 * A booking counts when its game has been PLAYED — marked played or settled,
 * or past its final whistle and neither cancelled nor a draft — and the
 * booking is still held (`confirmed`, or `reserved` for cash nobody has
 * marked paid yet). ~~And the player was not marked a no-show~~ — attendance
 * is gone (2026-11-09). That is the player's own account page's rule
 * (`lib/booking/history.ts`), so the two pages agree.
 */

export interface ActivityGame {
  id: string;
  startsAt: string;
  status: GameStatus;
  /** Null or absent: the null-row fallback, like every other surface. */
  durationMinutes?: number | null;
}

export interface ActivityBooking {
  playerId: string;
  gameId: string;
  status: BookingStatus;
}

export interface PlayerActivity {
  /** Distinct games played. */
  gamesPlayed: number;
  /** Kick-off of the latest game played. */
  lastGameAt: string | null;
  /** Every booking row, whatever became of it. */
  bookingCount: number;
}

const HELD: ReadonlySet<BookingStatus> = new Set(["confirmed", "reserved"]);

/**
 * Whether a game has been PLAYED: marked played or settled, or past its FINAL
 * WHISTLE and not cancelled (2026-11-09 — ~~kicked off~~: "a game has been
 * played once it finishes"). The sweep marks it within five minutes; this does
 * not wait for it.
 */
export function hasBeenPlayed(game: ActivityGame, now: number): boolean {
  if (game.status === "played" || game.status === "settled") return true;
  if (game.status === "cancelled" || game.status === "draft") return false;
  return hasFinished(game.startsAt, game.durationMinutes, now);
}

/** A held booking on a played game. ~~Unless marked a no-show~~ — attendance is gone. */
function isPlayed(status: BookingStatus, played: boolean): boolean {
  return played && HELD.has(status);
}

/** Each player's games played, last game and booking count, from every booking. */
export function summariseActivity(
  bookings: ActivityBooking[],
  games: ActivityGame[],
  now: number,
): Map<string, PlayerActivity> {
  const gamesById = new Map(games.map((game) => [game.id, game]));
  const played = new Map<string, Set<string>>();
  const activity = new Map<string, PlayerActivity>();

  for (const booking of bookings) {
    const entry = activity.get(booking.playerId) ?? { gamesPlayed: 0, lastGameAt: null, bookingCount: 0 };
    entry.bookingCount += 1;
    activity.set(booking.playerId, entry);

    const game = gamesById.get(booking.gameId);
    if (!game || !isPlayed(booking.status, hasBeenPlayed(game, now))) continue;

    const seen = played.get(booking.playerId) ?? new Set<string>();
    if (seen.has(game.id)) continue;
    seen.add(game.id);
    played.set(booking.playerId, seen);

    entry.gamesPlayed = seen.size;
    if (entry.lastGameAt === null || Date.parse(game.startsAt) > Date.parse(entry.lastGameAt)) {
      entry.lastGameAt = game.startsAt;
    }
  }

  return activity;
}

/** One history row, as the player page already has it. */
export interface HistoryRow {
  status: BookingStatus;
  /** Past its final whistle — read once per request by the query layer, never during render. */
  finished: boolean;
  startsAt: string;
}

export interface HistoryFigures {
  gamesPlayed: number;
  lastGameAt: string | null;
}

/**
 * The player page's figures, from its history rows. A cancelled game's
 * bookings are cancelled with it, so the booking's status is enough here.
 */
export function historyFigures(rows: HistoryRow[]): HistoryFigures {
  const played = rows.filter((row) => isPlayed(row.status, row.finished));
  const lastGameAt = played.reduce<string | null>(
    (latest, row) => (latest === null || Date.parse(row.startsAt) > Date.parse(latest) ? row.startsAt : latest),
    null,
  );

  return {
    gamesPlayed: played.length,
    lastGameAt,
  };
}
