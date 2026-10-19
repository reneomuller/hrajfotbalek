import { notifyWaitlistForGame } from "@/lib/cron/waitlistRelease";
import { PROFILE_PHOTOS_BUCKET } from "@/lib/storage/avatar";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";

/**
 * The half of deleting an account that SQL cannot do (round 40).
 *
 * `delete_player_account` anonymises the row, cancels future bookings and
 * lapses Credits in one transaction, then hands back the login and the stored
 * photos. Removing those needs the service role — an auth user and a storage
 * object are not reachable from plpgsql — so both deletion surfaces (the admin
 * player page and the player's own Account page) finish here.
 *
 * NEVER FATAL. The account is already anonymised and locked by the time this
 * runs; a failure leaves an orphaned login or file, which is logged loudly
 * rather than turned into an error the person cannot act on.
 */
export interface DeletionResult {
  authUserId: string | null;
  storagePaths: string[];
  bookingsCancelled: number;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** `null` means the account was already deleted — nothing is left to remove. */
export function parseDeletionResult(raw: unknown): DeletionResult | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;
  return {
    authUserId: text(row.auth_user_id),
    storagePaths: [text(row.photo_path), text(row.cover_path)].filter(
      (path): path is string => path !== null,
    ),
    bookingsCancelled: typeof row.bookings_cancelled === "number" ? row.bookings_cancelled : 0,
  };
}

export async function finishAccountDeletion(
  playerId: string,
  result: DeletionResult,
): Promise<void> {
  const service = createServiceRoleSupabaseClient();

  if (result.storagePaths.length > 0) {
    const { error } = await service.storage.from(PROFILE_PHOTOS_BUCKET).remove(result.storagePaths);
    if (error) console.error("account deletion: photo removal failed", { playerId, message: error.message });
  }

  if (result.authUserId) {
    const { error } = await service.auth.admin.deleteUser(result.authUserId);
    if (error) console.error("account deletion: login removal failed", { playerId, message: error.message });
  }

  // Freed seats may let the waitlist in — the same courtesy a ban extends.
  if (result.bookingsCancelled > 0) {
    try {
      const { data: freed } = await service
        .from("events")
        .select("game_id")
        .eq("event_type", "spot_released")
        .eq("player_id", playerId)
        .order("created_at", { ascending: false })
        .limit(20);
      const gameIds = new Set(
        ((freed ?? []) as { game_id: string | null }[])
          .map((row) => row.game_id)
          .filter((id): id is string => Boolean(id)),
      );
      for (const gameId of gameIds) await notifyWaitlistForGame(gameId);
    } catch (notifyError) {
      console.error("account deletion: waitlist notify failed", notifyError);
    }
  }
}
