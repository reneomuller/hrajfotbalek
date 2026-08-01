import type { SupabaseClient } from "@supabase/supabase-js";
import { execAsOwner } from "./clock.ts";
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

/**
 * A second scratch venue that DOES carry a photo.
 *
 * The default scratch venue deliberately has none, which is what makes it the
 * fixture for the "no photo" fallback (REQ-GAME-013). Proving the other half
 * of §5.4 needs a venue with an `image_path` — and it has to be a file that
 * actually exists under `public/venues/`, because `next/image` returns a 404
 * for one that does not and the assertion would be on a broken image rather
 * than on the panel.
 */
const PHOTO_VENUE_NAME = "E2E Photo Pitch";
const PHOTO_VENUE_IMAGE = "/venues/prazacka.png";

/**
 * The venue is created on demand and deliberately NOT torn down: several specs
 * run in the same session and recreating it per spec would be pure round
 * trips. It is a real row in `venues` and it does show up in the admin venue
 * picker, so delete it before launch if the suite has been run against the
 * production database — `LAUNCH.md` step 1 notes this.
 */
let cachedVenueId: string | null = null;
let cachedPhotoVenueId: string | null = null;

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

/** The scratch venue that carries a photo, created on demand. */
async function photoVenueId(admin: SupabaseClient): Promise<string> {
  if (cachedPhotoVenueId) return cachedPhotoVenueId;

  const existing = await admin
    .from("venues")
    .select("id")
    .eq("name", PHOTO_VENUE_NAME)
    .maybeSingle();
  if (existing.data?.id) {
    cachedPhotoVenueId = existing.data.id as string;
    return cachedPhotoVenueId;
  }

  const { data, error } = await admin.rpc("admin_create_venue", {
    p_name: PHOTO_VENUE_NAME,
    p_image_path: PHOTO_VENUE_IMAGE,
    p_map_query: null,
  });
  if (error) throw new Error(`create photo venue: ${error.message}`);

  cachedPhotoVenueId = data as string;
  return cachedPhotoVenueId;
}

export interface ScratchGame {
  id: string;
  capacity: number;
  priceCzk: number;
  durationMinutes: number | null;
  /** The stored kick-off, so a spec can work out which day tab holds it. */
  startsAt: string;
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
  startsAt: startsAtOverride,
  organizerName = "E2E Organizer",
  organizerPhone = null,
  durationMinutes = null,
  allowedSkillLevels = null,
  subsPerTeam = null,
  format = null,
  publish = true,
  withVenuePhoto = false,
}: {
  capacity?: number;
  priceCzk?: number;
  hoursFromNow?: number;
  /**
   * An exact kick-off instant, overriding `hoursFromNow`.
   *
   * The games list filters by Prague calendar day, so a spec that needs
   * several games on ONE day has to pin them rather than offset them from
   * "now" and hope the run does not straddle midnight.
   */
  startsAt?: string;
  organizerName?: string;
  organizerPhone?: string | null;
  durationMinutes?: number | null;
  allowedSkillLevels?: ("beginner" | "intermediate" | "advanced")[] | null;
  subsPerTeam?: number | null;
  format?: string | null;
  /** A draft game, for the specs that need one. Published by default. */
  publish?: boolean;
  /** Put the game at the scratch venue that HAS a photo (REQ-GAME-012). */
  withVenuePhoto?: boolean;
} = {}): Promise<ScratchGame> {
  const organizer = await apiClientFor(players.organizer);
  const admin = serviceClient();

  const startsAt =
    startsAtOverride ?? new Date(Date.now() + hoursFromNow * 3600_000).toISOString();

  // v2 since Phase 13 — the function the admin form actually calls. Building
  // fixtures through the orphaned v1 pair would leave every scratch game
  // without an organizer, which is exactly the state §5 says cannot exist.
  const { data: id, error } = await organizer.rpc("admin_create_game_v2", {
    p_venue_id: withVenuePhoto ? await photoVenueId(admin) : await scratchVenueId(admin),
    p_starts_at: startsAt,
    p_capacity: capacity,
    p_price_czk: priceCzk,
    p_organizer_name: organizerName,
    p_format: format,
    p_surface: null,
    p_notes: null,
    p_organizer_phone: organizerPhone,
    p_duration_minutes: durationMinutes,
    p_allowed_skill_levels: allowedSkillLevels,
    p_subs_per_team: subsPerTeam,
  });
  if (error) throw new Error(`admin_create_game_v2: ${error.message}`);

  if (publish) {
    const { error: publishError } = await organizer.rpc("publish_game", { p_game_id: id });
    if (publishError) throw new Error(`publish_game: ${publishError.message}`);
  }

  return { id: id as string, capacity, priceCzk, durationMinutes, startsAt };
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
  // The organizer contact cascades on the game delete, but deleting it first
  // keeps teardown in one explicit reverse-dependency order rather than half
  // stated and half inferred from a foreign key.
  await admin.from("game_organizer_contacts").delete().eq("game_id", gameId);
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

/**
 * Removes every wallet row a spec created for a player.
 *
 * THROUGH THE OWNER CONNECTION, and it has to be. `credit_ledger` and
 * `credit_topups` are append-only by privilege: `service_role` has no UPDATE
 * on either and no DELETE on `credit_topups`, so a PostgREST `.delete()` is
 * refused without raising — which is how the first version of the pass spec
 * quietly left seven confirmed top-ups in the seed database and then failed on
 * a `.single()` that found them all.
 *
 * `walletBalance()` above is the read side and stays on the service client;
 * only teardown needs this.
 */
export async function resetWallet(playerId: string): Promise<void> {
  await execAsOwner("delete from public.credit_ledger where player_id = $1", [playerId]);
  await execAsOwner("delete from public.events where player_id = $1 and event_type in ('topup_requested','topup_confirmed','credit_expired')", [playerId]);
  await execAsOwner("delete from public.credit_topups where player_id = $1", [playerId]);
}
