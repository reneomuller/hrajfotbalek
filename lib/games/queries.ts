import { createServerSupabaseClient } from "@/lib/supabase/clients";
import type { Database } from "@/lib/types/database";

type GameRow = Database["public"]["Tables"]["games"]["Row"];
type RosterRow = Database["public"]["Views"]["game_roster_public"]["Row"];
type VenueRow = Database["public"]["Tables"]["venues"]["Row"];

/**
 * Read paths for the player-facing game surfaces.
 *
 * WHY THE COUNT COMES FROM `game_roster_public` AND NOT `bookings`:
 * `bookings` is granted to `authenticated` only and carries own-row RLS, so an
 * anonymous visitor counting it gets zero rows — not an error, just a silently
 * wrong counter. `game_roster_public` is the anon-readable projection and it
 * already filters to active bookings (`reserved` + `confirmed`) on publicly
 * visible games, which is exactly the capacity definition `create_booking`
 * enforces. Counting it keeps the displayed number and the RPC's decision in
 * agreement for signed-out and signed-in visitors alike.
 *
 * The counter is computed server-side on load and may be slightly stale by the
 * time it is read. That is accepted: `create_booking` is the authority on
 * whether a spot exists, and a stale-by-seconds number is far safer than a
 * client-side one that drifts.
 */

export const PUBLIC_GAME_STATUSES = [
  "published",
  "full",
  "played",
  "settled",
] as const;

export interface GameWithCount {
  game: GameRow;
  bookedCount: number;
  spotsLeft: number;
  /**
   * Whether kick-off has passed.
   *
   * Computed here rather than in a component: reading the clock during render
   * is impure, and the value is only ever used to mirror a rule the RPCs
   * enforce anyway. The query layer already runs per request, so this is the
   * honest place for it.
   */
  hasStarted: boolean;
  isCancelled: boolean;
}

function decorate(game: GameRow, bookedCount: number, now: number): GameWithCount {
  return {
    game,
    bookedCount,
    spotsLeft: Math.max(0, game.capacity - bookedCount),
    hasStarted: new Date(game.starts_at).getTime() <= now,
    isCancelled: game.status === "cancelled",
  };
}

/** Counts active roster rows per game id, in one round trip. */
async function countRosterByGame(gameIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (gameIds.length === 0) return counts;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("game_roster_public")
    .select("game_id")
    .in("game_id", gameIds);

  if (error || !data) return counts;

  for (const row of data as Pick<RosterRow, "game_id">[]) {
    counts.set(row.game_id, (counts.get(row.game_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Upcoming publicly-visible games, soonest first.
 *
 * The `status` filter is defence in depth, not the enforcement point: the
 * `games_select_public` RLS policy already hides draft and cancelled games
 * from anon and authenticated alike. Stating it here as well means a future
 * policy change cannot silently widen this surface.
 */
export async function listUpcomingGames(limit = 20): Promise<GameWithCount[]> {
  const supabase = await createServerSupabaseClient();

  const { data: games, error } = await supabase
    .from("games")
    .select("*")
    .in("status", ["published", "full"])
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(limit);

  if (error || !games) return [];

  const counts = await countRosterByGame(games.map((g) => g.id));
  const now = Date.now();

  return games.map((game) => decorate(game, counts.get(game.id) ?? 0, now));
}

/** The soonest upcoming game, for the landing next-match block. */
export async function getNextGame(): Promise<GameWithCount | null> {
  const games = await listUpcomingGames(1);
  return games[0] ?? null;
}

/**
 * A single game by id, or null when it is not publicly visible.
 *
 * A draft or cancelled game returns null through RLS rather than 403, so the
 * page renders a not-found state — which is the correct disclosure: an
 * anonymous visitor learns nothing about whether the id exists.
 */
export async function getGameById(id: string): Promise<GameWithCount | null> {
  const supabase = await createServerSupabaseClient();

  const { data: game, error } = await supabase
    .from("games")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !game) return null;

  const counts = await countRosterByGame([game.id]);
  return decorate(game, counts.get(game.id) ?? 0, Date.now());
}

/**
 * The venue a game is at, or null when the game predates `venue_id`.
 *
 * A separate query rather than a PostgREST embed: the hand-authored `Database`
 * type models tables, not join shapes, and an embedded select would have to be
 * cast back to something this file made up. Venues are public reference data,
 * so this needs no elevation — `venues_select_public` admits every row.
 */
export async function getVenue(venueId: string | null): Promise<VenueRow | null> {
  if (!venueId) return null;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("venues")
    .select("*")
    .eq("id", venueId)
    .maybeSingle();

  return error || !data ? null : data;
}

/** The PII-safe roster for a game. */
export async function getRoster(gameId: string): Promise<RosterRow[]> {
  const supabase = await createServerSupabaseClient();

  // PII BOUNDARY: this projection is nickname + status only, and must stay
  // that way. The view cannot expose player_id/email/phone — it does not
  // project them — but selecting `*` here would still be a latent hazard if
  // the view were ever widened, so the columns are named explicitly.
  const { data, error } = await supabase
    .from("game_roster_public")
    .select("game_id, nickname, status")
    .eq("game_id", gameId);

  if (error || !data) return [];
  return data as RosterRow[];
}

/**
 * Roster nicknames per game, in join order, for a set of games in one round
 * trip.
 *
 * The list page renders avatars on every card, and doing that with one query
 * per card is how a twenty-game list becomes twenty-one round trips. Same
 * anon-readable view as `getRoster`, same PII boundary: nickname only.
 *
 * `game_roster_public` has no ordering guarantee of its own, so this sorts by
 * nickname for a stable render. Join order is not available through the view —
 * it projects no timestamp, deliberately — and a list whose avatars reshuffle
 * between requests looks broken, so a deterministic order matters more here
 * than the real one.
 */
export async function listRostersByGame(
  gameIds: string[],
): Promise<Map<string, string[]>> {
  const rosters = new Map<string, string[]>();
  if (gameIds.length === 0) return rosters;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("game_roster_public")
    .select("game_id, nickname")
    .in("game_id", gameIds);

  if (error || !data) return rosters;

  for (const row of data) {
    const list = rosters.get(row.game_id) ?? [];
    list.push(row.nickname);
    rosters.set(row.game_id, list);
  }
  for (const list of rosters.values()) list.sort((a, b) => a.localeCompare(b));

  return rosters;
}

/**
 * The public waiting list for a game — nickname and position, in queue order.
 *
 * THE QUEUE IS PUBLIC, on the same reasoning as the roster: a pickup game is a
 * social object, and a queue nobody can see is a queue nobody trusts. What is
 * NOT public is how the queue is built — `game_waitlist_public` projects no
 * `player_id` and no `joined_at`, so a visitor can read the order without
 * reading when anyone was on their phone. See migration 20.
 */
export async function getWaitlist(
  gameId: string,
): Promise<Database["public"]["Views"]["game_waitlist_public"]["Row"][]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("game_waitlist_public")
    .select("game_id, nickname, position")
    .eq("game_id", gameId)
    .order("position", { ascending: true });

  if (error || !data) return [];
  return data;
}

/**
 * Game ids the signed-in player is waiting on, for the list's "You're waiting"
 * badges.
 *
 * Reads `waitlist` directly rather than the public view, and that is the point:
 * own-row RLS means this returns the caller's rows and nobody else's, so the
 * badge cannot be made to appear on someone else's behalf. A signed-out visitor
 * gets an empty set, which is the correct answer rather than an error.
 */
export async function listOwnWaitlistGameIds(): Promise<Set<string>> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("waitlist")
    .select("game_id")
    .is("converted_booking_id", null);

  if (error || !data) return new Set();
  return new Set(data.map((row) => row.game_id));
}

/**
 * Venue rows for a set of games, keyed by id, in one round trip.
 *
 * The single-venue `getVenue` is still the right call on the game page; this is
 * for the list, where one query per card would dominate the render. Nulls are
 * dropped before the query rather than filtered after, since a game with no
 * venue link simply has no row to fetch.
 */
export async function getVenues(
  venueIds: (string | null)[],
): Promise<Map<string, VenueRow>> {
  const ids = [...new Set(venueIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map();

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("venues").select("*").in("id", ids);

  if (error || !data) return new Map();
  return new Map(data.map((venue) => [venue.id, venue]));
}
