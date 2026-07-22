import type { SupabaseClient } from "@supabase/supabase-js";
import { apiClientFor, players, serviceClient } from "./session.ts";

/**
 * Disposable fixtures, built and torn down per spec.
 *
 * WHY NOT JUST USE THE SEED. The seed fixtures are a fixed tableau: one full
 * game, one settled game, specific wallet balances. A spec that books a seeded
 * game changes that tableau for every spec after it, and for the next run —
 * so the suite would pass once and then start failing in ways that depend on
 * how often it had been run before. That is the worst kind of flake, because
 * re-running it "fixes" nothing and the first failure is never reproducible.
 *
 * So specs that MUTATE state build their own game and destroy it afterwards.
 * The seed fixtures are still used, but for READING — the roster, the full
 * game, the settled game.
 *
 * Everything here goes through the real RPCs, with one deliberate exception:
 * teardown deletes rows directly as service_role, because there is no RPC for
 * "make this game never have existed" and there should not be.
 */

const VENUE_NAME = "E2E Scratch Pitch";

let cachedVenueId: string | null = null;

/** The venue every disposable game sits at, created once. */
async function scratchVenueId(admin: SupabaseClient): Promise<string> {
  if (cachedVenueId) return cachedVenueId;

  const existing = await admin.from("venues").select("id").eq("name", VENUE_NAME).maybeSingle();
  if (existing.data?.id) {
    cachedVenueId = existing.data.id as string;
    return cachedVenueId;
  }

  const { data, error } = await admin.rpc("admin_create_venue", {
    p_name: VENUE_NAME,
    p_image_path: null,
    p_map_query: null,
  });
  if (error) throw new Error(`create scratch venue: ${error.message}`);

  cachedVenueId = data as string;
  return cachedVenueId;
}

export interface ScratchGame {
  id: string;
  capacity: number;
  priceCzk: number;
}

/**
 * A published game, created through the admin RPCs as the organizer.
 *
 * `hoursFromNow` defaults to well outside every policy window (nudge at 12h,
 * reminder at 24h), so a spec that is not testing the sweeps is never caught
 * by one.
 */
export async function createScratchGame({
  capacity = 12,
  priceCzk = 200,
  hoursFromNow = 24 * 30,
}: {
  capacity?: number;
  priceCzk?: number;
  hoursFromNow?: number;
} = {}): Promise<ScratchGame> {
  const organizer = await apiClientFor(players.organizer);
  const admin = serviceClient();

  const startsAt = new Date(Date.now() + hoursFromNow * 3600_000).toISOString();

  const { data: id, error } = await organizer.rpc("admin_create_game", {
    p_venue_id: await scratchVenueId(admin),
    p_starts_at: startsAt,
    p_capacity: capacity,
    p_price_czk: priceCzk,
  });
  if (error) throw new Error(`admin_create_game: ${error.message}`);

  const { error: publishError } = await organizer.rpc("publish_game", { p_game_id: id });
  if (publishError) throw new Error(`publish_game: ${publishError.message}`);

  return { id: id as string, capacity, priceCzk };
}

/**
 * Removes a scratch game and everything hanging off it.
 *
 * Reverse dependency order, and not by cascade: `events` foreign keys are
 * ON DELETE SET NULL, so deleting the game first would orphan its events
 * rather than remove them — they would then accumulate across runs and skew
 * the event-catalog assertions in `data.spec.ts`.
 */
export async function destroyScratchGame(gameId: string): Promise<void> {
  const admin = serviceClient();

  // Ledger entries reference the booking they came from.
  const { data: bookings } = await admin.from("bookings").select("id").eq("game_id", gameId);
  const bookingIds = (bookings ?? []).map((b: { id: string }) => b.id);

  if (bookingIds.length > 0) {
    await admin.from("credit_ledger").delete().in("booking_id", bookingIds);
    await admin.from("events").delete().in("booking_id", bookingIds);
  }

  await admin.from("events").delete().eq("game_id", gameId);
  await admin.from("waitlist").delete().eq("game_id", gameId);
  await admin.from("bookings").delete().eq("game_id", gameId);
  await admin.from("games").delete().eq("id", gameId);
}

/** A player's current wallet balance, read as service_role. */
export async function walletBalance(playerId: string): Promise<number> {
  const admin = serviceClient();
  const { data, error } = await admin
    .from("credit_ledger")
    .select("delta_czk")
    .eq("player_id", playerId);
  if (error) throw new Error(`read wallet: ${error.message}`);

  return (data ?? []).reduce(
    (sum: number, row: { delta_czk: number }) => sum + row.delta_czk,
    0,
  );
}

/**
 * Moves a wallet to exactly `target` CZK through `grant_credit`.
 *
 * Through the RPC rather than by inserting a ledger row: `credit_ledger` is
 * append-only by privilege and a spec that reaches around that is testing a
 * state the product cannot produce.
 */
export async function setWalletTo(playerId: string, target: number): Promise<void> {
  const current = await walletBalance(playerId);
  const delta = target - current;
  if (delta === 0) return;

  const organizer = await apiClientFor(players.organizer);
  const { error } = await organizer.rpc("grant_credit", {
    p_player_id: playerId,
    p_delta_czk: delta,
    p_note: "e2e scaffold",
  });
  if (error) throw new Error(`grant_credit(${delta}): ${error.message}`);
}

/** Cancels every active booking a player holds, so specs start from zero. */
export async function clearActiveBookings(playerKey: keyof typeof players): Promise<void> {
  const player = players[playerKey];
  const admin = serviceClient();
  const session = await apiClientFor(player);

  const { data } = await admin
    .from("bookings")
    .select("id")
    .eq("player_id", player.id)
    .in("status", ["reserved", "confirmed"]);

  for (const row of (data ?? []) as { id: string }[]) {
    await session.rpc("cancel_booking", { p_booking_id: row.id });
  }
}
