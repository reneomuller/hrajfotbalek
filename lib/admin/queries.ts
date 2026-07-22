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
