import { pitchHours } from "@/lib/home/pitchHours";
import type { BookingWithGame } from "@/lib/booking/queries";

/**
 * The three numbers at the top of a profile.
 *
 * DERIVED, NEVER STORED. There is no `players.games_played` column and this
 * round does not add one: SCOPE.md's front-end rule forbids a new column, and
 * a counter maintained by triggers is a second source of truth that can
 * disagree with the bookings it counts. Every figure here is a fold over rows
 * the page has already loaded.
 *
 * NO NEW QUERY EITHER. `listOwnBookings()` already returns each booking beside
 * its game, own-row by RLS, and it already carries `venue_id` and
 * `duration_minutes` because it selects the whole row. So this is a pure
 * function over data the account page was fetching anyway — which is also what
 * makes all three testable without a database.
 */

export interface ProfileStats {
  /** Games actually played. See `PLAYED_BOOKING_STATUSES` for what counts. */
  gamesPlayed: number;
  /** Hours on the pitch, one decimal, nulls resolved through policy. */
  hours: number;
  /** Distinct pitches. */
  venues: number;
}

/**
 * WHAT COUNTS AS A GAME PLAYED, and it is not a judgement call — it is
 * migration 39's definition, restated so the two cannot drift.
 *
 * `game_roster_public.games_played` publishes exactly this figure beside a
 * nickname on every game page. If the profile counted anything else, a player
 * would read one number under their own face and a different one beside their
 * own name on a roster, and neither would be wrong enough to explain.
 *
 * The definition is BOOKING HELD × GAME HAPPENED, and each half is load-bearing:
 *
 *   - `reserved`/`confirmed` and not `cancelled`/`expired` — the spot was held
 *     to the end.
 *   - `played`/`settled` and not `published`/`full` — the game has happened.
 *     A counter that rises when you book is a counter measuring intent.
 *
 * ATTENDANCE IS DELIBERATELY NOT CONSULTED, though `bookings.attendance` exists
 * and holds `present`/`no_show`. It is null until an organizer settles a game,
 * so counting on it would make a player's own history depend on how promptly
 * somebody else did admin — the number would drop for weeks and then return.
 * The no-show count is its own figure on the admin player detail, where it is
 * about conduct rather than about how much football someone has played.
 */
const PLAYED_BOOKING_STATUSES = new Set(["reserved", "confirmed"]);
const PLAYED_GAME_STATUSES = new Set(["played", "settled"]);

export function profileStats(rows: BookingWithGame[]): ProfileStats {
  const played = rows.filter(
    ({ booking, game }) =>
      PLAYED_BOOKING_STATUSES.has(booking.status) &&
      PLAYED_GAME_STATUSES.has(game.status),
  );

  /*
   * DISTINCT BY `venue_id`, NOT BY THE VENUE STRING.
   *
   * `games.venue` is denormalised free text captured at creation time, so the
   * same pitch appears under whatever it was called that week — and the em-dash
   * to bullet change in the fixtures means one pitch currently reads two ways
   * in production until the owner's UPDATE runs. Counting strings would report
   * that as two venues.
   *
   * Nulls are dropped rather than counted as one anonymous pitch: migration 19
   * backfilled every historic game, so a null here is a game with no venue at
   * all, which is not a pitch anybody has played on.
   */
  const venueIds = new Set(
    played
      .map(({ game }) => game.venue_id)
      .filter((id): id is string => id !== null),
  );

  return {
    gamesPlayed: played.length,
    hours: pitchHours(played.map(({ game }) => game.duration_minutes)),
    venues: venueIds.size,
  };
}

/**
 * Which stat the THIRD tile shows (round 23, item 1).
 *
 * A PURE FUNCTION BECAUSE IT IS THE CAPABILITY GATE'S VISIBLE BEHAVIOUR, and
 * the gate is the half that ships to production BEFORE the migration lands.
 * The e2e suite can only exercise one side of it — the local database has
 * `players_met`, production does not yet — so the side that will be live on
 * deploy day gets tested here instead of being reasoned about.
 *
 * NULL IS "THIS DATABASE CANNOT COUNT IT", NEVER ZERO. See
 * `lib/profile/playersMet.ts`: a zero would render `0 players met` under the
 * face of someone with a hundred games, confidently, on every request.
 */
export function thirdStat(
  stats: ProfileStats,
  playersMet: number | null,
): { key: "venues" | "met"; value: number } {
  return playersMet === null
    ? { key: "venues", value: stats.venues }
    : { key: "met", value: playersMet };
}
