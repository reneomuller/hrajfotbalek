import { canOfferCancel, isCancellationRefundable } from "@/lib/booking/badges";
import { isInProgress } from "@/lib/games/duration";
import { policy } from "@/lib/policy";
import { refundCutoffHours } from "@/lib/policy/refundCutoff";
import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/clients";
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

/**
 * Counts active roster rows per game id, in one round trip.
 *
 * A ROW IS A SEAT since round 11, so this counts people rather than bookings
 * with no change to the query: a party of three arrives as three rows and a
 * game holding two house guests as two more. Every `{booked} / {capacity}`,
 * every `spotsLeft`, and the games list's own fullness follow from here — and
 * they now agree with `game_seats_taken()` in the database, which is the
 * authority `create_booking` refuses against.
 */
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
  /**
   * NULL FOR A GUEST WITH NO NAME OF ITS OWN — a party seat or a house seat.
   * The label is built by `guestLabel()` from the two fields below, so that
   * "Karel's Guest 2" can be Czech and Russian too.
   *
   * A pre-round-11 shadow player DOES carry a nickname and is still a guest;
   * that is the whole of "existing shadow players keep rendering".
   */
  nickname: string | null;
  photoPath: string | null;
  /** Draw a monogram and sort to the end of the row. */
  isGuest: boolean;
  /** The player who brought this one, on a party seat. */
  guestOf: string | null;
  /** 1-based, among that owner's guests or among the house guests. */
  guestIndex: number | null;
}

/**
 * A roster VIEW ROW as a seat.
 *
 * One mapper, used by every render site, so that "which columns become a
 * seat" is answered once. Three call sites were each spelling out
 * `{nickname, photoPath}` before round 11, and each would have had to learn
 * about guests separately.
 */
export function toRosterAvatar(row: {
  nickname: string | null;
  photo_path: string | null;
  is_guest: boolean;
  guest_of: string | null;
  guest_index: number | null;
  /*
   * ~~`is_pending`~~ — round 25's anonymous checkout seat. Pay-first removed
   * the state (round 26, item 1); the COLUMN is still projected by the view so
   * the deployed application does not break the moment the migration lands,
   * and it is dropped by the cleanup script the owner runs. Accepted and
   * ignored here rather than removed from the select, so neither order of
   * those two events breaks anything.
   */
  is_pending?: boolean | null;
}): RosterAvatar {
  return {
    nickname: row.nickname,
    photoPath: row.photo_path,
    isGuest: row.is_guest,
    guestOf: row.guest_of,
    guestIndex: row.guest_index,
  };
}

/**
 * A seat that is a named person and nothing more — the waiting list's shape.
 *
 * `game_waitlist_public` projects no photo and has no notion of a guest: you
 * cannot queue on somebody else's behalf. Passing the literal object at the
 * call site would work and would also mean that the next field added to
 * `RosterAvatar` has to be remembered there.
 */
export function plainAvatar(nickname: string): RosterAvatar {
  return {
    nickname,
    photoPath: null,
    isGuest: false,
    guestOf: null,
    guestIndex: null,
  };
}

/**
 * SEATS IN RENDER ORDER: everybody with a name first, guests after them.
 *
 * The frames' game boxes are a row of overlapping faces, and a row that
 * alternates between faces and monograms reads as a rendering fault rather
 * than as a group. Guests last keeps the recognisable half of the row
 * together, which is the whole reason the sort exists.
 *
 * Within each half the order is by name, then by owner, then by index —
 * deterministic, because `game_roster_public` has no ordering guarantee of its
 * own and a row whose avatars reshuffle between requests looks broken.
 */
export function sortRoster(seats: RosterAvatar[]): RosterAvatar[] {
  return [...seats].sort((a, b) => {
    if (a.isGuest !== b.isGuest) return a.isGuest ? 1 : -1;
    const byName = (a.nickname ?? "").localeCompare(b.nickname ?? "");
    if (byName !== 0) return byName;
    const byOwner = (a.guestOf ?? "").localeCompare(b.guestOf ?? "");
    if (byOwner !== 0) return byOwner;
    return (a.guestIndex ?? 0) - (b.guestIndex ?? 0);
  });
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
  /**
   * The organizer's Telegram username, bare — no `@`, no `t.me/` (round 19,
   * item 2). Null when they have not set one, which is the ordinary case and
   * what sends a Ukrainian/Russian game back to the WhatsApp button.
   */
  telegram: string | null;
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
  const nameResult = await supabase.rpc("game_organizer_public", {
    p_game_id: gameId,
  });

  const [phone, telegram] = await Promise.all([
    organizerWhatsAppNumber(gameId),
    organizerTelegramHandle(gameId),
  ]);

  return {
    name: nameResult.error ? null : ((nameResult.data as string | null) ?? null),
    phone,
    telegram,
  };
}

/**
 * The organizer's Telegram username, or null (round 19, item 2).
 *
 * READ FOR EVERYONE, like the number beside it — the round-8 ruling is that
 * the organizer is reachable by anyone looking at the game, and a handle is
 * less sensitive than a phone: it is a name its owner published.
 *
 * NULL IS THE ORDINARY CASE and it is what makes the fallback work. A
 * Ukrainian/Russian game whose organizer has no handle offers WhatsApp, so
 * contact is always possible and no link goes nowhere.
 *
 * TOLERATES THE COLUMN'S ABSENCE. Before the migration the select fails and
 * this returns null, which is the same answer as "no handle set" — so every
 * such game shows WhatsApp, exactly as it does today.
 */
async function organizerTelegramHandle(gameId: string): Promise<string | null> {
  const service = createServiceRoleSupabaseClient();
  const { data, error } = await service
    .from("game_organizer_contacts")
    .select("organizer_telegram")
    .eq("game_id", gameId)
    .maybeSingle();

  return error || !data ? null : (data.organizer_telegram ?? null);
}

/**
 * The organizer's number for the WhatsApp link — READ FOR EVERYONE.
 *
 * ~~`game_organizer_phone()` resolves the caller's identity inside the
 * function, so a viewer without a booking cannot see the number and an
 * anonymous one may not even ask.~~
 *
 * **REVERSED 2026-08-20 by the owner (round 8, item 8).** The ruling is that
 * the organizer is reachable on WhatsApp by EVERYONE looking at the game,
 * including someone who has not booked and someone who is not signed in. A
 * person deciding whether to travel across Prague for a pickup game should be
 * able to ask a question first, and gating that behind a booking is the wrong
 * way round.
 *
 * **WHAT THAT COSTS, STATED PLAINLY BECAUSE IT IS A REAL COST.** The number
 * now reaches the HTML of a public page. Anyone — including a crawler — can
 * read it out of the `wa.me` href. Migration 27 built the gate deliberately
 * and its reasoning was sound; what changed is the owner's judgement about
 * whose convenience wins, not a discovery that the gate was wrong.
 *
 * **THE RPC AND ITS GATE ARE UNTOUCHED.** `game_organizer_phone()` still
 * exists, still refuses `anon`, and still gates on a booking. This reads the
 * table directly with the service client instead — the same elevated read the
 * admin surface already uses on this table — so no privilege is widened in the
 * database and nothing else that calls the RPC changes behaviour. Reverting
 * this ruling is deleting this function, not another migration.
 */
async function organizerWhatsAppNumber(gameId: string): Promise<string | null> {
  const service = createServiceRoleSupabaseClient();
  const { data, error } = await service
    .from("game_organizer_contacts")
    .select("organizer_phone")
    .eq("game_id", gameId)
    .maybeSingle();

  return error || !data ? null : data.organizer_phone;
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
  /**
   * Whether cancelling now would still be CREDITED (policy v2).
   *
   * Separate from `canCancel` because v2 separated the two questions:
   * cancelling stays open to kickoff, crediting stops ten hours before it.
   * Decided off the SAME `now` as `canCancel` below, so the pair can never
   * describe two different instants.
   */
  refundable: boolean;
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

  const now = Date.now();

  return {
    booking,
    canCancel:
      game != null &&
      canOfferCancel(
        booking.status,
        game.starts_at,
        now,
        policy.cancellation.cutoffHoursBeforeStart,
      ),
    refundable:
      game != null &&
      isCancellationRefundable(game.starts_at, now, await refundCutoffHours()),
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
    .select("game_id, nickname, photo_path, games_played, is_guest, guest_of, guest_index, is_pending")
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
 * THE GAME'S OWN NAME WINS; THE VENUE'S IS THE DEFAULT (migration 41).
 *
 * ~~Read from `venues` through `venue_id`, never denormalised onto `games`.~~
 * Both columns now exist and they mean different things: `venues.pitch_name`
 * is the ground's default pitch, and `games.pitch_name` is the one THIS game
 * is played on. A game names its own only when the organizer typed one; null
 * inherits, which is why an empty box in the form stores null rather than "".
 *
 * The precedence has to be this way round. Storing a per-game name on `venues`
 * would rewrite the pitch of every other game at that ground — including ones
 * already played and settled — which is the reason migration 41 added a column
 * at all instead of reusing the venue's.
 *
 * THE VENUE READ IS SKIPPED ENTIRELY when every game names its own, and the
 * function still costs one round trip for a whole page. `games.venue` stays a
 * snapshot for the reason it always was: a rename must not rewrite the name on
 * a game already played (migration 20260722110000).
 *
 * A game with no name of its own and a null `venue_id` simply has no entry,
 * which renders the venue name alone. Those exist: every game created before
 * the `venues` table carried one until migration 19 backfilled them.
 */
export async function listPitchNamesByGame(
  games: { id: string; venue_id: string | null; pitch_name?: string | null }[],
): Promise<Map<string, string>> {
  const pitchNames = new Map<string, string>();

  // The game's own name first — no query needed for these at all.
  const needVenue: { id: string; venue_id: string | null }[] = [];
  for (const game of games) {
    const own = game.pitch_name?.trim();
    if (own) pitchNames.set(game.id, own);
    else needVenue.push(game);
  }

  const venueIds = [
    ...new Set(needVenue.map((g) => g.venue_id).filter((id): id is string => id !== null)),
  ];
  if (venueIds.length === 0) return pitchNames;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("venues")
    .select("id, pitch_name")
    .in("id", venueIds);

  if (error || !data) return pitchNames;

  const byVenue = new Map(data.map((row) => [row.id, row.pitch_name]));
  for (const game of needVenue) {
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
    .select("game_id, nickname, photo_path, is_guest, guest_of, guest_index, is_pending")
    .in("game_id", gameIds);

  if (error || !data) return rosters;

  for (const row of data) {
    const list = rosters.get(row.game_id) ?? [];
    list.push(toRosterAvatar(row));
    rosters.set(row.game_id, list);
  }
  for (const [gameId, list] of rosters) {
    rosters.set(gameId, sortRoster(list));
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


/**
 * Each game's venue photograph, keyed by game id (round 13, item 24).
 *
 * ONE ROUND TRIP FOR A WHOLE PAGE, like `listPitchNamesByGame` beside it — the
 * list renders a dozen cards and a per-card venue read would be a dozen trips.
 *
 * SEPARATE FROM `listPitchNamesByGame` RATHER THAN FOLDED INTO IT. That
 * function has four call sites and returns a `Map<string, string>` they all
 * destructure; widening its value to an object would touch every one of them
 * to add a field two of them do not want. Two small queries that each answer
 * one question beat one that answers two badly.
 *
 * A GAME WITH NO `venue_id` SIMPLY HAS NO ENTRY, which renders the default.
 * Those exist: every game created before the `venues` table carried a null
 * until migration 19 backfilled them, and the fallback is the point.
 */
export async function listVenueImagesByGame(
  games: { id: string; venue_id: string | null }[],
): Promise<Map<string, string>> {
  const images = new Map<string, string>();

  const venueIds = [...new Set(games.map((g) => g.venue_id).filter((id): id is string => !!id))];
  if (venueIds.length === 0) return images;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("venues")
    .select("id, image_path")
    .in("id", venueIds);

  if (error || !data) return images;

  const byVenue = new Map(data.map((row) => [row.id, row.image_path]));
  for (const game of games) {
    const path = game.venue_id ? byVenue.get(game.venue_id) : null;
    if (path) images.set(game.id, path);
  }
  return images;
}
