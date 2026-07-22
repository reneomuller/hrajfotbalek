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

export interface AdminBookingRow {
  id: string;
  playerId: string;
  nickname: string;
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
    .select("id, nickname")
    .in("id", playerIds);

  const nicknames = new Map((players ?? []).map((p) => [p.id, p.nickname]));

  return bookings.map((booking) => ({
    id: booking.id,
    playerId: booking.player_id,
    nickname: nicknames.get(booking.player_id) ?? "",
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
