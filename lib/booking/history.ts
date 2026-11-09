import type { BookingWithGame } from "@/lib/booking/queries";
import { hasFinished } from "@/lib/games/duration";

/**
 * Splitting a player's bookings into the two questions they actually have.
 *
 * "My bookings" was one reverse-chronological list, which answered neither
 * question well: what am I committed to, and what have I played? Those are
 * different tenses and different actions, so they are separated here rather
 * than in the page, where the rule would be untestable.
 *
 * Pure, and split on the FINAL WHISTLE (2026-11-09) — ~~on kickoff~~: "the game
 * should dissapear for the user only after it has finished" — rather than on
 * booking status. A cancelled booking
 * on a future game is not "upcoming" — there is nothing to turn up to — and a
 * confirmed booking on a past game belongs in history whether or not anyone got
 * round to marking attendance.
 */

export interface PlayerHistory {
  /** Active bookings on games that have not finished, soonest first. */
  upcoming: BookingWithGame[];
  /** Everything whose final whistle has gone, most recent first. */
  past: BookingWithGame[];
  /**
   * Games actually played: a finished game the player did not cancel out of.
   * ~~Excluding a marked no-show~~ — attendance is gone (2026-11-09: "remove
   * the 'present' and 'no-show' function from the web completely"), and a
   * mark recorded before then no longer counts against anybody.
   */
  gamesPlayed: number;
}

const ACTIVE = new Set(["reserved", "confirmed"]);

export function splitHistory(rows: BookingWithGame[], now = Date.now()): PlayerHistory {
  const upcoming: BookingWithGame[] = [];
  const past: BookingWithGame[] = [];

  for (const row of rows) {
    if (hasFinished(row.game.starts_at, row.game.duration_minutes, now)) {
      past.push(row);
    } else if (ACTIVE.has(row.booking.status)) {
      upcoming.push(row);
    }
    // A cancelled or expired booking on a future game is deliberately in
    // neither list: there is nothing to attend and nothing to look back on.
  }

  upcoming.sort(
    (a, b) => new Date(a.game.starts_at).getTime() - new Date(b.game.starts_at).getTime(),
  );
  past.sort(
    (a, b) => new Date(b.game.starts_at).getTime() - new Date(a.game.starts_at).getTime(),
  );

  return {
    upcoming,
    past,
    gamesPlayed: past.filter(({ booking }) => ACTIVE.has(booking.status)).length,
  };
}
