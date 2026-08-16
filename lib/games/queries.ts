import { canOfferCancel } from "@/lib/booking/badges";
import { isInProgress } from "@/lib/games/duration";
import { policy } from "@/lib/policy";
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
  /**
   * Kicked off and not yet finished.
   *
   * Distinct from `hasStarted`, which stays true forever: a game that started
   * ten minutes ago and one that finished two hours ago are the same boolean
   * and very different sentences to put on a page. Resolves the per-game
   * duration with the policy fallback, through the same helper the card, the
   * `.ics` and the schema.org block use (§5.2, REQ-GAME-008).
   */
  inProgress: boolean;
  isCancelled: boolean;
}

function decorate(game: GameRow, bookedCount: number, now: number): GameWithCount {
  return {
    game,
    bookedCount,
    spotsLeft: Math.max(0, game.capacity - bookedCount),
    hasStarted: new Date(game.starts_at).getTime() <= now,
    inProgress: isInProgress(game.starts_at, game.duration_minutes, now),
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

export interface UpcomingGames {
  games: GameWithCount[];
  /**
   * The instant the list was decorated at.
   *
   * RETURNED RATHER THAN RE-READ BY THE CALLER, for two reasons. Reading the
   * clock during render is impure — the lint rule saying so is enforcing a
   * real property, since a server render and its hydration must not disagree
   * about what time it is. And the day-picker strip has to label "Today" from
   * the SAME instant `hasStarted` and `inProgress` were computed from; two
   * readings a few milliseconds apart across midnight would put a game on a
   * tab labelled by the other day.
   */
  now: number;
}

/**
 * Upcoming publicly-visible games, soonest first.
 *
 * The `status` filter is defence in depth, not the enforcement point: the
 * `games_select_public` RLS policy already hides draft and cancelled games
 * from anon and authenticated alike. Stating it here as well means a future
 * policy change cannot silently widen this surface.
 */
export async function listUpcomingGames(
  limit: number | null = 20,
): Promise<UpcomingGames> {
  const supabase = await createServerSupabaseClient();
  const now = Date.now();

  /*
   * `null` MEANS NO LIMIT, for the games page's `All` view: the owner's ruling
   * of 2026-08-10 makes "every upcoming game, any distance out" a guarantee,
   * and a default cap is a truncation nobody sees. Callers that genuinely want
   * a few — home's three, the next-game strip's one — still pass a number.
   */
  let query = supabase
    .from("games")
    .select("*")
    .in("status", ["published", "full"])
    .gte("starts_at", new Date(now).toISOString())
    .order("starts_at", { ascending: true });

  if (limit !== null) query = query.limit(limit);

  const { data: games, error } = await query;

  if (error || !games) return { games: [], now };

  const counts = await countRosterByGame(games.map((g) => g.id));

  return {
    games: games.map((game) => decorate(game, counts.get(game.id) ?? 0, now)),
    now,
  };
}

/** The soonest upcoming game, for the landing next-match block. */
export async function getNextGame(): Promise<GameWithCount | null> {
  const { games } = await listUpcomingGames(1);
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
 * What an avatar needs, and nothing more.
 *
 * `photoPath` joined the roster view in Phase 15 (§4a). The initials avatar
 * remains the fallback everywhere and is the ORDINARY case, not an error
 * state: most players will never upload a photo.
 */
export interface RosterAvatar {
  nickname: string;
  photoPath: string | null;
}

export interface GameOrganizer {
  /** Published on the card and the detail for anyone. */
  name: string | null;
  /**
   * Null for everyone except a caller holding a `reserved` or `confirmed`
   * booking on this game — and null rather than an error, so "no phone
   * recorded" and "not yours to see" are indistinguishable to the caller.
   */
  phone: string | null;
}

/**
 * The organizer of a game, through the two exits §5.1 built.
 *
 * NEITHER OF THESE IS A TABLE READ. `game_organizer_contacts` grants nothing
 * to `anon` or `authenticated`, which is the entire reason the phone does not
 * live on `games` — SELECT there is granted table-wide, so a phone column
 * would have been world-readable the moment it existed, whatever this code
 * did about it.
 *
 * `game_organizer_phone()` resolves the caller's identity from the session
 * inside the function. Nothing here passes an id, and nothing here decides
 * who may see the number: an application-side check would gate the render and
 * leave the number one API call away.
 */
export async function getGameOrganizer(gameId: string): Promise<GameOrganizer> {
  const supabase = await createServerSupabaseClient();

  const [nameResult, phoneResult] = await Promise.all([
    supabase.rpc("game_organizer_public", { p_game_id: gameId }),
    supabase.rpc("game_organizer_phone", { p_game_id: gameId }),
  ]);

  return {
    name: nameResult.error ? null : ((nameResult.data as string | null) ?? null),
    // An anonymous caller is DENIED execute on the phone function, so this
    // errors rather than returning null for them. Both outcomes mean the same
    // thing here and both render as nothing.
    phone: phoneResult.error ? null : ((phoneResult.data as string | null) ?? null),
  };
}

export interface OwnBookingOnGame {
  booking: Database["public"]["Tables"]["bookings"]["Row"];
  /**
   * Whether to OFFER the cancel affordance. Mirrors `cancel_booking`, which
   * remains the enforcement authority and is called regardless.
   *
   * Decided here rather than during render for the same reason `hasStarted`
   * is: reading the clock in a component is impure, and the lint rule that
   * says so is enforcing a real property — a server-rendered page and its
   * hydration must not disagree about what time it is.
   */
  canCancel: boolean;
}

/**
 * The signed-in player's own active booking on a game, or null.
 *
 * REQ-GAME-018. The determination that makes `/game/[id]` state-aware, and it
 * is made SERVER-SIDE from the caller's own row — never from a nickname match
 * against the public roster, which is display-grade and would let anyone see
 * "their" booking by choosing a nickname.
 *
 * `bookings_select_own` RLS is the enforcement: the policy restricts the row
 * set to bookings whose player maps to `auth.uid()`, so a signed-out visitor
 * gets nothing and a signed-in one gets only their own. No `player_id` filter
 * is written here, for the same reason it is absent in `lib/booking/queries.ts`
 * — writing one would suggest this code is the enforcement point.
 */
export async function getOwnActiveBooking(
  gameId: string,
): Promise<OwnBookingOnGame | null> {
  const supabase = await createServerSupabaseClient();

  const { data: booking, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("game_id", gameId)
    .in("status", ["reserved", "confirmed"])
    .maybeSingle();

  if (error || !booking) return null;

  const { data: game } = await supabase
    .from("games")
    .select("starts_at")
    .eq("id", gameId)
    .maybeSingle();

  return {
    booking,
    canCancel:
      game != null &&
      canOfferCancel(
        booking.status,
        game.starts_at,
        Date.now(),
        policy.cancellation.cutoffHoursBeforeStart,
      ),
  };
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

  // PII BOUNDARY: this projection is nickname, photo_path and games_played,
  // and must stay that way. The view cannot expose player_id/email/phone — it
  // does not project them — but selecting `*` here would still be a latent
  // hazard, and this list is the proof: the view gained `photo_path` in Phase
  // 15 and `games_played` in migration 39, and each time a reviewer saw the
  // widening reach the render deliberately rather than through a wildcard
  // nobody looked at.
  //
  // `status` WAS HERE, and its removal is the lesson. PlayersList stopped
  // rendering booking status long ago, with a comment explaining that
  // reserved-versus-confirmed is the difference between having paid and not,
  // and nobody else's business on a public page. But the view kept projecting
  // it and this select kept asking for it, so the column was gone from the
  // page and still on the wire: any holder of the anon key could call
  // `?select=nickname,status&status=eq.reserved` and get a list of named
  // players who had not paid. Migration 20260808150000 narrowed the view.
  //
  // The general lesson, worth more than the fix: deciding not to SHOW a field
  // is not deciding not to SEND it, and on a PostgREST-backed project the wire
  // is a public interface whether or not any component reads from it.
  const { data, error } = await supabase
    .from("game_roster_public")
    .select("game_id, nickname, photo_path, games_played")
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
/**
 * Pitch names for a set of games, keyed by game id, in one round trip.
 *
 * READ FROM `venues` THROUGH `venue_id`, never denormalised onto `games`.
 * `games.venue` is a deliberate snapshot — a rename must not rewrite the name
 * on a game already played (migration 20260722110000) — so the pitch name is
 * looked up live and joined at render. One extra query for a whole page, the
 * same shape as the roster lookup beside it.
 *
 * A game with a null `venue_id` simply has no entry, which renders the venue
 * name alone. Those exist: every game created before the `venues` table
 * carried one until migration 19 backfilled them.
 */
export async function listPitchNamesByGame(
  games: { id: string; venue_id: string | null }[],
): Promise<Map<string, string>> {
  const pitchNames = new Map<string, string>();
  const venueIds = [...new Set(games.map((g) => g.venue_id).filter((id): id is string => id !== null))];
  if (venueIds.length === 0) return pitchNames;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("venues")
    .select("id, pitch_name")
    .in("id", venueIds);

  if (error || !data) return pitchNames;

  const byVenue = new Map(data.map((row) => [row.id, row.pitch_name]));
  for (const game of games) {
    const pitch = game.venue_id ? byVenue.get(game.venue_id) : null;
    if (pitch) pitchNames.set(game.id, pitch);
  }
  return pitchNames;
}

export async function listRostersByGame(
  gameIds: string[],
): Promise<Map<string, RosterAvatar[]>> {
  const rosters = new Map<string, RosterAvatar[]>();
  if (gameIds.length === 0) return rosters;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("game_roster_public")
    .select("game_id, nickname, photo_path")
    .in("game_id", gameIds);

  if (error || !data) return rosters;

  for (const row of data) {
    const list = rosters.get(row.game_id) ?? [];
    list.push({ nickname: row.nickname, photoPath: row.photo_path });
    rosters.set(row.game_id, list);
  }
  for (const list of rosters.values()) {
    list.sort((a, b) => a.nickname.localeCompare(b.nickname));
  }

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
