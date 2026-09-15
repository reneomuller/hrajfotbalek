import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";
import type { Database, GameStatus } from "@/lib/types/database";

type GameRow = Database["public"]["Tables"]["games"]["Row"];
type VenueRow = Database["public"]["Tables"]["venues"]["Row"];

/**
 * Admin READ paths.
 *
 * WHY THESE USE THE SERVICE-ROLE CLIENT. `games_select_public` admits only
 * published/full/played/settled, and it applies to `authenticated` sessions —
 * an admin included. RLS has no is-admin branch, deliberately: widening the
 * public policy to "…or the caller is an admin" would put an elevation path in
 * the row policy of the table an anonymous visitor reads. So drafts, cancelled
 * games, other players' rows and the event log are read here with the service
 * key instead.
 *
 * THE SERVICE KEY IS FOR READS ONLY, and every function in this file is a
 * read. Writes go through `supabase.rpc()` on the ADMIN'S OWN session client,
 * because `is_admin_caller() or is_service_role()` means a service-role write
 * satisfies the RPC's check no matter which human triggered it — which would
 * reduce the whole gate to "did they know the URL". Same rule the Phase 18
 * cancel action documents.
 *
 * Every caller sits under `app/admin/layout.tsx`, which runs `requireAdmin()`
 * before any of this is reached.
 */

export interface AdminGameRow extends GameRow {
  /**
   * SEATS taken — the number the pitch actually has to hold.
   *
   * ~~Active (reserved + confirmed) BOOKINGS.~~ Renamed in meaning rather than
   * in name (round 35, item 2): the field has always been rendered as
   * `{activeCount}/{capacity}`, which is a seat count everywhere else in the
   * product, and it was counting rows. Guests are included, house guests
   * included, straight from `game_seats_taken`.
   */
  activeCount: number;
  /** Unconverted waitlist rows. The expansion-trigger sensor (REQ-UI-018). */
  waitlistCount: number;
  /**
   * Seats held but not paid for — `reserved` bookings (round 28, item 7).
   *
   * A SUBSET OF `activeCount`, NOT A SEPARATE POPULATION. Both count rows that
   * hold a seat; this one counts the ones that still owe money, which is what
   * "what do I have to chase before this game" means and what the list can now
   * sort by. Under pay-first an online booking is born `confirmed`, so a
   * non-zero here is a cash-rail or legacy hold.
   */
  unpaidCount: number;
}

/** Every game, newest kick-off first, including drafts and cancelled ones. */
export async function listAllGames(
  { includeDrafts = false }: { includeDrafts?: boolean } = {},
): Promise<AdminGameRow[]> {
  const service = createServiceRoleSupabaseClient();

  /*
   * DRAFTS ARE OUT OF THE GAMES LIST BY DEFAULT (round 9, item 7).
   *
   * Creating a game publishes it (round 8, item 6), so a draft is now either
   * one made before that change or one whose publish call failed. Neither is a
   * game on the board, and leaving them in the list meant scrolling past rows
   * that are not real fixtures to reach the ones that are.
   *
   * They are not hidden — `/admin/games/new` lists them as unfinished work,
   * which is where somebody about to make a game will see them. The flag is
   * how that page asks for them.
   */
  let query = service.from("games").select("*").order("starts_at", { ascending: false });
  if (!includeDrafts) query = query.neq("status", "draft");

  const { data: games, error } = await query;

  if (error || !games) return [];

  const ids = games.map((g) => g.id);
  const [active, waiting, unpaid] = await Promise.all([
    countSeatsTaken(ids),
    countWaitlist(ids),
    countUnpaidBookings(ids),
  ]);

  return games.map((game) => ({
    ...game,
    activeCount: active.get(game.id) ?? 0,
    waitlistCount: waiting.get(game.id) ?? 0,
    unpaidCount: unpaid.get(game.id) ?? 0,
  }));
}

/** One game by id regardless of status, or null. */
export async function getAdminGame(id: string): Promise<AdminGameRow | null> {
  const service = createServiceRoleSupabaseClient();

  const { data: game, error } = await service
    .from("games")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !game) return null;

  const [active, waiting, unpaid] = await Promise.all([
    countSeatsTaken([game.id]),
    countWaitlist([game.id]),
    countUnpaidBookings([game.id]),
  ]);

  return {
    ...game,
    activeCount: active.get(game.id) ?? 0,
    waitlistCount: waiting.get(game.id) ?? 0,
    unpaidCount: unpaid.get(game.id) ?? 0,
  };
}

/** All venues, alphabetically — the picker on the game form. */
export async function listVenues(): Promise<VenueRow[]> {
  const service = createServiceRoleSupabaseClient();

  const { data, error } = await service
    .from("venues")
    .select("*")
    .order("name", { ascending: true });

  return error || !data ? [] : data;
}

/*
 * ~~`listPitchNameSuggestions` — every pitch name already in use, read off the
 * `pitch_name_suggestions` view, for the game form's datalist.~~ REMOVED with
 * the field it fed (round 16, item 20).
 *
 * THE VIEW STAYS IN THE DATABASE, deliberately. It is a query rather than an
 * entity — the distinct non-null names across `games` and `venues` — so it
 * costs nothing to leave, and `/admin/venues` is the surface where a pitch is
 * named now. Dropping it would be a migration whose only effect is to remove
 * a harmless read, on a night the owner cannot apply migrations anyway.
 */

export type GameOrganizerRow =
  Database["public"]["Tables"]["game_organizer_contacts"]["Row"];

/**
 * The stored organizer contact for a game, or null.
 *
 * SERVICE-ROLE, and it has to be. `game_organizer_contacts` grants nothing to
 * `anon` or `authenticated` at all (§5.1) — that is the entire reason the
 * phone lives off `games`, where SELECT is granted table-wide. An admin's own
 * session cannot read this table and should not be able to; the edit form
 * pre-fills from here, under `requireAdmin()`, and the two public exits
 * (`game_organizer_public`, `game_organizer_phone`) stay the only other ways
 * out.
 */
export async function getGameOrganizer(gameId: string): Promise<GameOrganizerRow | null> {
  const service = createServiceRoleSupabaseClient();

  const { data, error } = await service
    .from("game_organizer_contacts")
    .select("*")
    .eq("game_id", gameId)
    .maybeSingle();

  return error || !data ? null : data;
}

export interface AdminBookingRow {
  id: string;
  playerId: string;
  nickname: string;
  /**
   * The player's self-declared level, for the roster export.
   *
   * Null when they have not set one — which is a real state and is written as
   * an empty cell rather than as "unknown", because an organizer sorting a
   * spreadsheet on this column should see a blank and not a value.
   */
  skillLevel: Database["public"]["Tables"]["players"]["Row"]["skill_level"] | null;
  status: Database["public"]["Tables"]["bookings"]["Row"]["status"];
  paymentMethod: Database["public"]["Tables"]["bookings"]["Row"]["payment_method"];
  /** The variable symbol. Null for anything that is not a QR booking. */
  paymentCode: number | null;
  priceCzk: number;
  creditAppliedCzk: number;
  /** What the player still owes — what ✓ Paid confirms at. */
  amountDueCzk: number;
  /**
   * Party guests on this booking (round 11). The admin roster shows them
   * beside the name that brought them; `priceCzk` above is already the whole
   * party's, so nothing else on this row needs to know.
   */
  guestCount: number;
  attendance: Database["public"]["Tables"]["bookings"]["Row"]["attendance"];
  isSeed: boolean;
  bookedByAdmin: boolean;
}

/**
 * Every booking on a game, VS-sorted.
 *
 * ORDERED BY `payment_code` because that is the order the organizer's banking
 * app shows incoming payments in, and this list exists to be read side by side
 * with that screen. `nullsFirst: false` puts cash and credit bookings — which
 * have no variable symbol — after the QR ones rather than at the top of the
 * list the admin is scanning. The `(game_id, payment_code)` index from Phase 4
 * serves exactly this shape.
 */
export async function listGameBookings(gameId: string): Promise<AdminBookingRow[]> {
  const service = createServiceRoleSupabaseClient();

  const { data: bookings, error } = await service
    .from("bookings")
    .select("*")
    .eq("game_id", gameId)
    .order("payment_code", { ascending: true, nullsFirst: false });

  if (error || !bookings) return [];

  const playerIds = [...new Set(bookings.map((b) => b.player_id))];
  const { data: players } = await service
    .from("players")
    .select("id, nickname, skill_level")
    .in("id", playerIds);

  const nicknames = new Map((players ?? []).map((p) => [p.id, p.nickname]));
  // Same single round trip the nicknames already cost — the column rides along
  // rather than adding a query.
  const skills = new Map((players ?? []).map((p) => [p.id, p.skill_level]));

  return bookings.map((booking) => ({
    id: booking.id,
    playerId: booking.player_id,
    nickname: nicknames.get(booking.player_id) ?? "",
    skillLevel: skills.get(booking.player_id) ?? null,
    status: booking.status,
    paymentMethod: booking.payment_method,
    paymentCode: booking.payment_code,
    priceCzk: booking.price_czk,
    creditAppliedCzk: booking.credit_applied_czk,
    amountDueCzk: Math.max(0, booking.price_czk - booking.credit_applied_czk),
    attendance: booking.attendance,
    guestCount: booking.guest_count,
    isSeed: booking.is_seed,
    bookedByAdmin: booking.booked_by_admin,
  }));
}

/** Bookings still holding a spot — the capacity-relevant set. */
export function activeBookings(rows: AdminBookingRow[]): AdminBookingRow[] {
  return rows.filter((row) => row.status === "reserved" || row.status === "confirmed");
}

/**
 * SEATS, not bookings — the number the pitch actually has to hold.
 *
 * Mirrors `game_seats_taken()` in the database, which is the authority. This
 * exists so the admin page can DISABLE "add a guest" instead of letting the
 * RPC refuse it, and it must never become the thing a decision is made on:
 * the RPC counts under the game's advisory lock, and this counts a snapshot a
 * concurrent booking can already have invalidated.
 */
export function seatsTaken(
  rows: AdminBookingRow[],
  houseGuests: number,
): number {
  return activeBookings(rows).reduce((total, row) => total + 1 + row.guestCount, houseGuests);
}

/**
 * Unpaid holds: the ones settle is blocked on.
 *
 * A `reserved` booking is money owed with nothing recording that it is owed.
 * Phase 24 refuses to settle while any remain; Phase 22 is where the admin
 * clears them.
 */
export function unpaidBookings(rows: AdminBookingRow[]): AdminBookingRow[] {
  return rows.filter((row) => row.status === "reserved");
}

export interface AdminPlayerRow {
  id: string;
  nickname: string;
  email: string | null;
  /**
   * Carried for the SEARCH, not for display — no row renders it.
   *
   * The list already selects `*`, so this costs nothing; without it the search
   * box would offer to match a phone number it never received, which is a
   * placeholder promising something the code cannot do.
   */
  phone: string | null;
  /** Null `auth_user_id` is what makes a row a shadow. */
  isShadow: boolean;
  isSeed: boolean;
  isAdmin: boolean;
  /** `SUM(delta_czk)` over the whole ledger — the wallet, computed here. */
  balanceCzk: number;
  bookingCount: number;
  /**
   * The permanent signup-order number (round 33, item 2).
   *
   * NULL UNTIL THE MIGRATION IS APPLIED, and null is a rendering instruction
   * rather than an error: the surfaces print nothing. `select("*")` means this
   * appears on its own the moment the column exists, with no deploy.
   */
  playerNumber: number | null;
  /**
   * The avatar's storage key, or null (round 35 v2, item 9).
   *
   * THE KEY, NOT A URL. Building the URL needs `NEXT_PUBLIC_SUPABASE_URL` and a
   * cache-busting stamp, and both belong to the surface that renders it —
   * `avatarUrl` is what every other avatar in this product goes through, and a
   * second way of composing the same address is a second thing to get wrong.
   */
  photoPath: string | null;
  /** `created_at`, which is what `avatarUrl` uses as its cache stamp. */
  createdAt: string;
}

/**
 * Every player with their balance and booking count.
 *
 * The balance is summed from `credit_ledger` rather than stored anywhere: the
 * ledger is append-only and is the authority, and a cached balance column is a
 * second source of truth waiting to disagree with it.
 */
export async function listPlayers(): Promise<AdminPlayerRow[]> {
  const service = createServiceRoleSupabaseClient();

  const [{ data: players }, { data: ledger }, { data: bookings }] = await Promise.all([
    service.from("players").select("*").order("nickname", { ascending: true }),
    service.from("credit_ledger").select("player_id, delta_czk"),
    service.from("bookings").select("player_id"),
  ]);

  const balances = new Map<string, number>();
  for (const row of ledger ?? []) {
    balances.set(row.player_id, (balances.get(row.player_id) ?? 0) + row.delta_czk);
  }

  const counts = new Map<string, number>();
  for (const row of bookings ?? []) {
    counts.set(row.player_id, (counts.get(row.player_id) ?? 0) + 1);
  }

  return (players ?? []).map((player) => ({
    id: player.id,
    nickname: player.nickname,
    email: player.email,
    phone: player.phone,
    isShadow: player.auth_user_id === null,
    isSeed: player.is_seed,
    isAdmin: player.is_admin,
    balanceCzk: balances.get(player.id) ?? 0,
    bookingCount: counts.get(player.id) ?? 0,
    playerNumber: player.player_number ?? null,
    photoPath: player.photo_path ?? null,
    createdAt: player.created_at,
  }));
}

/**
 * SEATS taken per game, from the database's own counter.
 *
 * ~~`select game_id from bookings where status in (…)`, one per row.~~ THAT
 * COUNTED BOOKINGS, AND A BOOKING IS NOT A SEAT. A party of three is one row
 * and three seats, and house guests on the game are not rows at all — so
 * `/admin/games` and the game page's `{booked}/{capacity}` readout both
 * undercounted every party ever booked, while every player surface had the
 * right number. The admin half was the one deciding whether a pitch needed
 * more people.
 *
 * `game_seats_taken` IS THE AUTHORITY and has been since round 11; it is what
 * `create_booking` refuses against. This asks IT rather than mirroring its
 * arithmetic in TypeScript — there is exactly one definition of a taken seat
 * and this is not a second one. `game_seats_taken_many` is the batch wrapper,
 * because a round trip per row on a list page is what the old query was
 * avoiding and that reason is still good.
 *
 * ~~AN EMPTY MAP ON ERROR, which reads as zero everywhere it lands.~~ THAT WAS
 * A LIVE REGRESSION AND IT SHIPPED. The RPC is created by a migration the owner
 * applies by hand, and the deploy lands first — so for the whole window between
 * them, every admin count read ZERO. Not stale: zero. The games list, the
 * capacity readout and the dashboard all showed empty pitches, which is exactly
 * the failure CLAUDE.md records for a missing GRANT: a read that comes back
 * empty looks like missing data rather than a missing function.
 *
 * SO IT FALLS BACK TO THE SEATS RATHER THAN TO NOTHING. `countSeatsFallback`
 * does `game_seats_taken`'s arithmetic — one per booking plus its guests, plus
 * the game's own house guests — over a single query that needs no migration.
 * It is a SECOND COPY of that arithmetic and it is here on purpose and on
 * borrowed time: the RPC is the counter, this is the bridge across the
 * deploy-to-apply window, and it can be deleted once `20260915100000` is
 * applied everywhere. A comment is not a plan, so it is also a ledger row.
 */
export async function countSeatsTaken(gameIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (gameIds.length === 0) return counts;

  const service = createServiceRoleSupabaseClient();
  const { data, error } = await service.rpc("game_seats_taken_many", {
    p_game_ids: gameIds,
  });

  if (error || !data) return countSeatsFallback(gameIds);

  for (const row of data as { game_id: string; seats_taken: number }[]) {
    counts.set(row.game_id, row.seats_taken);
  }
  return counts;
}

/**
 * `game_seats_taken`'s arithmetic, for a database that does not have the batch
 * wrapper yet. See the note above: a bridge, not a design.
 *
 * ONE PER BOOKING PLUS ITS GUESTS, PLUS THE GAME'S OWN. House guests live on
 * `games.guest_count` and are not booking rows at all, which is half of what
 * the row-counting version got wrong.
 */
async function countSeatsFallback(gameIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const service = createServiceRoleSupabaseClient();

  const [{ data: bookings }, { data: games }] = await Promise.all([
    service
      .from("bookings")
      .select("game_id,guest_count")
      .in("game_id", gameIds)
      .in("status", ["reserved", "confirmed"]),
    service.from("games").select("id,guest_count").in("id", gameIds),
  ]);

  for (const g of (games ?? []) as { id: string; guest_count: number }[]) {
    counts.set(g.id, g.guest_count ?? 0);
  }
  for (const b of (bookings ?? []) as { game_id: string; guest_count: number }[]) {
    counts.set(b.game_id, (counts.get(b.game_id) ?? 0) + 1 + (b.guest_count ?? 0));
  }
  return counts;
}

/**
 * Seats held but unpaid, per game (round 28, item 7).
 *
 * `reserved` ONLY. It is deliberately the same status test `settle_game` uses
 * to decide whether a game can be settled at all, so the number this list
 * sorts by is the number that actually blocks the close-out — see ledger row
 * 184, which is that set having been allowed to accumulate unseen.
 */
async function countUnpaidBookings(gameIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (gameIds.length === 0) return counts;

  const service = createServiceRoleSupabaseClient();
  const { data } = await service
    .from("bookings")
    .select("game_id")
    .in("game_id", gameIds)
    .eq("status", "reserved");

  for (const row of data ?? []) {
    counts.set(row.game_id, (counts.get(row.game_id) ?? 0) + 1);
  }
  return counts;
}

async function countWaitlist(gameIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (gameIds.length === 0) return counts;

  const service = createServiceRoleSupabaseClient();
  const { data } = await service
    .from("waitlist")
    .select("game_id")
    .in("game_id", gameIds)
    .is("converted_booking_id", null);

  for (const row of data ?? []) {
    counts.set(row.game_id, (counts.get(row.game_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Draft games only, oldest first — the "unfinished games" list (round 9,
 * item 7).
 *
 * OLDEST FIRST, unlike every other admin list. These are things somebody
 * started and did not finish, so the interesting one is the one that has been
 * sitting longest, not the newest.
 */
export async function listDraftGames(): Promise<AdminGameRow[]> {
  const all = await listAllGames({ includeDrafts: true });
  return all
    .filter((game) => game.status === "draft")
    .sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1));
}

/** Which transitions the admin UI should offer for a game in this state. */
export function availableTransitions(status: GameStatus): {
  canPublish: boolean;
  canEdit: boolean;
  canCancel: boolean;
  canPlay: boolean;
  canSettle: boolean;
} {
  return {
    canPublish: status === "draft",
    canEdit: status === "draft" || status === "published" || status === "full",
    canCancel: status === "draft" || status === "published" || status === "full",
    // `published → played` is legal on purpose: an under-capacity game that
    // never filled still gets played and settled.
    canPlay: status === "published" || status === "full",
    canSettle: status === "played",
  };
}

export interface AdminPlayerGameRow {
  bookingId: string;
  gameId: string;
  venue: string;
  startsAt: string;
  status: Database["public"]["Tables"]["bookings"]["Row"]["status"];
  attendance: Database["public"]["Tables"]["bookings"]["Row"]["attendance"];
  priceCzk: number;
  creditAppliedCzk: number;
  /**
   * Whether kick-off has passed.
   *
   * Decided here rather than in the row component: attendance on a future game
   * is a statement nobody can make yet, and reading the clock during render is
   * impure — the same rule `lib/games/queries.ts` follows for `hasStarted`.
   * The RPC remains the authority and refuses it regardless.
   */
  hasStarted: boolean;
}

export interface AdminPlayerDetail {
  player: Database["public"]["Tables"]["players"]["Row"];
  balanceCzk: number;
  /**
   * Games PLAYED, not bookings made.
   *
   * A cancelled booking is not a game someone turned up to, and an expired one
   * is a spot they lost. Counting either would make the number on this page
   * disagree with the number on the player's own account page, which counts
   * the same way (`lib/booking/history.ts`).
   */
  gamesPlayed: number;
  noShowCount: number;
  /** Every booking, newest kick-off first. */
  games: AdminPlayerGameRow[];
}

/**
 * One player, with everything the admin surface shows (REQ-ADMIN-001).
 *
 * SERVICE-ROLE, like every other admin read here: `players_select_own`
 * restricts an authenticated session to its own row, and widening that policy
 * to admit admins would put an elevation path in a row policy. Reads with the
 * service key; writes go through `supabase.rpc()` on the admin's own session.
 */
export async function getAdminPlayer(playerId: string): Promise<AdminPlayerDetail | null> {
  const service = createServiceRoleSupabaseClient();

  const { data: player, error } = await service
    .from("players")
    .select("*")
    .eq("id", playerId)
    .maybeSingle();

  if (error || !player) return null;

  const [{ data: ledger }, { data: bookings }] = await Promise.all([
    service.from("credit_ledger").select("delta_czk").eq("player_id", playerId),
    service
      .from("bookings")
      .select("id, game_id, status, attendance, price_czk, credit_applied_czk")
      .eq("player_id", playerId),
  ]);

  const balanceCzk = (ledger ?? []).reduce((sum, row) => sum + row.delta_czk, 0);

  const gameIds = [...new Set((bookings ?? []).map((b) => b.game_id))];
  const { data: games } = gameIds.length
    ? await service.from("games").select("id, venue, starts_at").in("id", gameIds)
    : { data: [] as { id: string; venue: string; starts_at: string }[] };

  const gamesById = new Map((games ?? []).map((g) => [g.id, g]));
  const now = Date.now();

  const rows: AdminPlayerGameRow[] = (bookings ?? [])
    .map((booking) => {
      const game = gamesById.get(booking.game_id);
      return {
        bookingId: booking.id,
        gameId: booking.game_id,
        venue: game?.venue ?? "—",
        startsAt: game?.starts_at ?? "",
        status: booking.status,
        attendance: booking.attendance,
        priceCzk: booking.price_czk,
        creditAppliedCzk: booking.credit_applied_czk,
        hasStarted: game ? Date.parse(game.starts_at) <= now : false,
      };
    })
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  const active = rows.filter(
    (row) => row.status === "confirmed" || row.status === "reserved",
  );

  return {
    player,
    balanceCzk,
    // Un-marked attendance counts as played, matching `lib/booking/history.ts`
    // — the organizer marks no-shows, not attendance, so an unmarked booking on
    // a past game means the player turned up and nobody said otherwise.
    gamesPlayed: active.filter((row) => row.attendance !== "no_show").length,
    noShowCount: rows.filter((row) => row.attendance === "no_show").length,
    games: rows,
  };
}


/**
 * Payments that arrived with nowhere to go.
 *
 * MONEY IS IN THE ACCOUNT AND NOBODY HAS A SEAT FOR IT. Three ways that
 * happens, all of them flagged by `confirm_online_payment` rather than guessed
 * at here: the payer was short, the window closed and the game filled behind
 * them, or a second checkout session paid a booking that was already settled.
 *
 * THE LIST IS EXPECTED TO BE EMPTY, and that is why it is rendered at the TOP
 * of the dashboard rather than behind a tab. A queue nobody visits is a queue
 * that grows; a queue that is normally empty costs one line of dashboard and
 * is impossible to miss on the day it is not.
 *
 * NOTHING RESOLVES IT AUTOMATICALLY. A sweep that refunded, or one that
 * bumped somebody else off a seat, would be the product making a decision
 * about a stranger's money. Oliver reads the row and decides.
 */
export interface PaymentAttentionRow {
  bookingId: string;
  gameId: string;
  venue: string;
  startsAt: string;
  nickname: string;
  amountOwedCzk: number;
  seats: number;
  reason: string;
  flaggedAt: string;
  stripeSessionId: string | null;
}

export async function listPaymentsNeedingAttention(): Promise<PaymentAttentionRow[]> {
  const service = createServiceRoleSupabaseClient();

  const { data: rows } = await service
    .from("bookings")
    /*
     * ONE LITERAL, not a concatenation. The Supabase client infers the row
     * shape from the select STRING at the type level, so a `+` between two
     * halves erases it and every field below becomes an error object. Worth a
     * long line.
     */
    .select("id, game_id, player_id, price_czk, credit_applied_czk, guest_count, payment_attention_at, payment_attention_reason, stripe_session_id")
    .not("payment_attention_at", "is", null)
    .order("payment_attention_at", { ascending: false })
    .limit(50);

  if (!rows || rows.length === 0) return [];

  // Two lookups for the whole set rather than a pair per row — the same shape
  // the dashboard's own rows use.
  const gameIds = [...new Set(rows.map((r) => r.game_id))];
  const playerIds = [...new Set(rows.map((r) => r.player_id))];

  const [{ data: games }, { data: players }] = await Promise.all([
    service.from("games").select("id, venue, starts_at").in("id", gameIds),
    service.from("players").select("id, nickname").in("id", playerIds),
  ]);

  const gameById = new Map((games ?? []).map((g) => [g.id, g]));
  const nickById = new Map((players ?? []).map((p) => [p.id, p.nickname]));

  return rows.map((row) => ({
    bookingId: row.id,
    gameId: row.game_id,
    venue: gameById.get(row.game_id)?.venue ?? "",
    startsAt: gameById.get(row.game_id)?.starts_at ?? "",
    nickname: nickById.get(row.player_id) ?? "",
    amountOwedCzk: Math.max(0, row.price_czk - row.credit_applied_czk),
    seats: 1 + row.guest_count,
    reason: row.payment_attention_reason ?? "",
    flaggedAt: row.payment_attention_at ?? "",
    stripeSessionId: row.stripe_session_id,
  }));
}
