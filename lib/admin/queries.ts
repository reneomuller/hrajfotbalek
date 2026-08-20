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
  /** Active (reserved + confirmed) bookings — the capacity-relevant count. */
  activeCount: number;
  /** Unconverted waitlist rows. The expansion-trigger sensor (REQ-UI-018). */
  waitlistCount: number;
}

/** Every game, newest kick-off first, including drafts and cancelled ones. */
export async function listAllGames(): Promise<AdminGameRow[]> {
  const service = createServiceRoleSupabaseClient();

  const { data: games, error } = await service
    .from("games")
    .select("*")
    .order("starts_at", { ascending: false });

  if (error || !games) return [];

  const ids = games.map((g) => g.id);
  const [active, waiting] = await Promise.all([
    countActiveBookings(ids),
    countWaitlist(ids),
  ]);

  return games.map((game) => ({
    ...game,
    activeCount: active.get(game.id) ?? 0,
    waitlistCount: waiting.get(game.id) ?? 0,
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

  const [active, waiting] = await Promise.all([
    countActiveBookings([game.id]),
    countWaitlist([game.id]),
  ]);

  return {
    ...game,
    activeCount: active.get(game.id) ?? 0,
    waitlistCount: waiting.get(game.id) ?? 0,
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

/**
 * Every pitch name already in use, for the game form's suggestions list.
 *
 * READS THE VIEW, NOT THE TABLES. `pitch_name_suggestions` (migration 41) is
 * the distinct non-null names across `games` and `venues` — a QUERY rather
 * than a `saved_pitches` entity, so there is no second source of truth to
 * disagree with the games referencing it, and no CRUD nobody asked for.
 *
 * NO SAVE FLAG. Every name an organizer types becomes available next time,
 * which is how the migration was applied and what the owner confirmed. The
 * flag version would be a boolean column and a second migration.
 *
 * THE EMPTY LIST IS THE NORMAL FIRST STATE, not a failure: nothing has been
 * typed yet on either database. The field is free text and works without a
 * single suggestion, which is why this returns `[]` on error rather than
 * throwing — a broken suggestions read must not take down game creation.
 */
export async function listPitchNameSuggestions(): Promise<string[]> {
  const service = createServiceRoleSupabaseClient();

  const { data, error } = await service
    .from("pitch_name_suggestions")
    .select("pitch_name");

  if (error || !data) return [];
  return data
    .map((row) => row.pitch_name)
    .filter((name): name is string => typeof name === "string" && name !== "");
}

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
    isSeed: booking.is_seed,
    bookedByAdmin: booking.booked_by_admin,
  }));
}

/** Bookings still holding a spot — the capacity-relevant set. */
export function activeBookings(rows: AdminBookingRow[]): AdminBookingRow[] {
  return rows.filter((row) => row.status === "reserved" || row.status === "confirmed");
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
  }));
}

async function countActiveBookings(gameIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (gameIds.length === 0) return counts;

  const service = createServiceRoleSupabaseClient();
  const { data } = await service
    .from("bookings")
    .select("game_id")
    .in("game_id", gameIds)
    .in("status", ["reserved", "confirmed"]);

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
