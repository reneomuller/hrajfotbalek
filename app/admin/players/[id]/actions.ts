"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { toAdminErrorMessage } from "@/lib/admin/errors";
import { PROFILE_PHOTOS_BUCKET } from "@/lib/storage/avatar";
import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/clients";

/**
 * Admin actions on one player.
 *
 * Writes go through `supabase.rpc()` on the ADMIN'S OWN session client, not
 * the service-role one — the RPCs accept `is_admin_caller() OR
 * is_service_role()`, so a service-role call would satisfy the check no matter
 * which human triggered the route.
 *
 * The one deliberate exception is deleting the storage OBJECT below, which is
 * not reachable from plpgsql at all.
 */

export interface PlayerAdminState {
  status: "idle" | "done" | "error";
  message?: string;
}

/**
 * Removes a player's profile photo (REQ-PROF-005).
 *
 * DEFERRED FROM PHASE 7 AND LANDING HERE. The RPC shipped in migration 24 with
 * no surface to call it from, which the Phase 7 note recorded — moderation
 * without a button is a capability nobody has.
 *
 * TWO HALVES, IN THIS ORDER, AND THE ORDER MATTERS. `remove_profile_photo`
 * clears `photo_path` and emits `profile_photo_removed`, returning the storage
 * path; the object itself is then deleted with the service-role client,
 * because `storage.objects` is not reachable from plpgsql.
 *
 * The column is cleared FIRST. If the object deletion then fails, the result is
 * an orphaned file nobody can reach — invisible, and cleanable later. The other
 * order risks the opposite: a deleted object with a row still pointing at it,
 * which renders as a broken image on every roster the player appears on.
 */
export async function removePhotoAction(
  _prev: PlayerAdminState,
  formData: FormData,
): Promise<PlayerAdminState> {
  await requireAdmin();

  const playerId = String(formData.get("playerId") ?? "");
  if (!playerId) return { status: "error", message: toAdminErrorMessage("PLAYER_NOT_FOUND") };

  const supabase = await createServerSupabaseClient();
  const { data: path, error } = await supabase.rpc("remove_profile_photo", {
    p_player_id: playerId,
  });

  if (error) return { status: "error", message: toAdminErrorMessage(error.message) };

  if (typeof path === "string" && path.length > 0) {
    const service = createServiceRoleSupabaseClient();
    const { error: storageError } = await service.storage
      .from(PROFILE_PHOTOS_BUCKET)
      .remove([path]);

    // Logged, never thrown. The reference is already gone, which is the part
    // that matters for moderation; a surviving object is unreachable.
    if (storageError) {
      console.error("profile photo object removal failed", storageError.message);
    }
  }

  revalidatePath(`/admin/players/${playerId}`);
  revalidatePath("/admin/players");
  return { status: "done" };
}
