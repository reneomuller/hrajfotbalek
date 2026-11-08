import type { AttendanceStatus, BookingStatus, GameStatus } from "@/lib/types/database";

/**
 * What a player has PLAYED (round 42, the admin rebuild).
 *
 * A booking counts when its game kicked off — marked played or settled, or past
 * its start and neither cancelled nor a draft — the booking is still held
 * (`confirmed`, or `reserved` for cash nobody has marked paid yet), and the
 * player was not marked a no-show. That is the player's own account page's
 * rule (`lib/booking/history.ts`): an unmarked booking on a past game means
 * they turned up and nobody said otherwise, so the two pages agree.
 */

export interface ActivityGame {
  id: string;
  startsAt: string;
  status: GameStatus;
}

export interface ActivityBooking {
  playerId: string;
  gameId: string;
  status: BookingStatus;
  attendance: AttendanceStatus | null;
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

export function hasKickedOff(game: ActivityGame, now: number): boolean {
  if (game.status === "played" || game.status === "settled") return true;
  if (game.status === "cancelled" || game.status === "draft") return false;
  return Date.parse(game.startsAt) <= now;
}

function isPlayed(status: BookingStatus, attendance: AttendanceStatus | null, kickedOff: boolean): boolean {
  return kickedOff && HELD.has(status) && attendance !== "no_show";
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
    if (!game || !isPlayed(booking.status, booking.attendance, hasKickedOff(game, now))) continue;

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
  attendance: AttendanceStatus | null;
  /** Read once per request by the query layer, never during render. */
  hasStarted: boolean;
  startsAt: string;
}

export interface HistoryFigures {
  gamesPlayed: number;
  lastGameAt: string | null;
  noShows: number;
}

/**
 * The player page's figures, from its history rows. A cancelled game's
 * bookings are cancelled with it, so the booking's status is enough here.
 */
export function historyFigures(rows: HistoryRow[]): HistoryFigures {
  const played = rows.filter((row) => isPlayed(row.status, row.attendance, row.hasStarted));
  const lastGameAt = played.reduce<string | null>(
    (latest, row) => (latest === null || Date.parse(row.startsAt) > Date.parse(latest) ? row.startsAt : latest),
    null,
  );

  return {
    gamesPlayed: played.length,
    lastGameAt,
    noShows: rows.filter((row) => row.attendance === "no_show").length,
  };
}
