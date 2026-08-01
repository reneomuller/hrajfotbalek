import type { BookingWithGame } from "@/lib/booking/queries";

/**
 * Splitting a player's bookings into the two questions they actually have.
 *
 * "My bookings" was one reverse-chronological list, which answered neither
 * question well: what am I committed to, and what have I played? Those are
 * different tenses and different actions — one has a cancel button, the other
 * has an attendance mark — so they are separated here rather than in the page,
 * where the rule would be untestable.
 *
 * Pure, and split on kickoff rather than on booking status. A cancelled booking
 * on a future game is not "upcoming" — there is nothing to turn up to — and a
 * confirmed booking on a past game belongs in history whether or not anyone got
 * round to marking attendance.
 */

export interface PlayerHistory {
  /** Active bookings on games that have not started, soonest first. */
  upcoming: BookingWithGame[];
  /** Everything that has already kicked off, most recent first. */
  past: BookingWithGame[];
  /**
   * Games actually played: a past game the player did not cancel out of.
   *
   * Counts `present` and un-marked attendance alike, and excludes `no_show`.
   * Attendance marking is an admin action that may simply not have happened —
   * counting only `present` would make the number drift down every time an
   * organizer forgot, which is a statement about the organizer rather than the
   * player.
   */
  gamesPlayed: number;
  /** Marked no-shows. Shown only when non-zero; nobody needs a zero here. */
  noShows: number;
}

const ACTIVE = new Set(["reserved", "confirmed"]);

export function splitHistory(rows: BookingWithGame[], now = Date.now()): PlayerHistory {
  const upcoming: BookingWithGame[] = [];
  const past: BookingWithGame[] = [];

  for (const row of rows) {
    const started = new Date(row.game.starts_at).getTime() <= now;
    if (started) {
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

  const attended = past.filter(
    ({ booking }) => ACTIVE.has(booking.status) && booking.attendance !== "no_show",
  );

  return {
    upcoming,
    past,
    gamesPlayed: attended.length,
    noShows: past.filter(({ booking }) => booking.attendance === "no_show").length,
  };
}
