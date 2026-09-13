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
  /** The stored display name, when a rename succeeded (round 33, item 1). */
  name?: string;
}

/**
 * Admin moderation of a player's BANNER (round 30, item 2).
 *
 * ITS SIBLING'S SHAPE, DELIBERATELY. `removePhotoAction` below does the same
 * three things in the same order — RPC clears the row and returns the path,
 * the service-role client deletes the object, a storage failure is logged and
 * never thrown — and the two reading alike is the point: they are one act
 * against two columns, and a reader comparing them should find nothing to
 * compare.
 *
 * THE OBJECT DELETE IS BEST-EFFORT, for the same reason as the avatar's: the
 * REFERENCE is already gone, which is the half that matters for moderation,
 * and a surviving object in the bucket is unreachable from the product.
 */
export async function removeCoverAction(
  _prev: PlayerAdminState,
  formData: FormData,
): Promise<PlayerAdminState> {
  await requireAdmin();

  const playerId = String(formData.get("playerId") ?? "");
  if (!playerId) return { status: "error", message: toAdminErrorMessage("PLAYER_NOT_FOUND") };

  const supabase = await createServerSupabaseClient();
  const { data: path, error } = await supabase.rpc("remove_profile_cover", {
    p_player_id: playerId,
  });

  if (error) return { status: "error", message: toAdminErrorMessage(error.message) };

  if (typeof path === "string" && path.length > 0) {
    const service = createServiceRoleSupabaseClient();
    const { error: storageError } = await service.storage
      .from(PROFILE_PHOTOS_BUCKET)
      .remove([path]);

    if (storageError) {
      console.error("profile cover object removal failed", storageError.message);
    }
  }

  revalidatePath(`/admin/players/${playerId}`);
  revalidatePath("/admin/players");
  return { status: "done" };
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

/**
 * Admin rename of a player's display name (round 33, item 1).
 *
 * WHY IT IS NOT `removePhotoAction`'S SHAPE. Those two clear a column and then
 * delete a storage object, so they have a second half that can fail
 * independently. This one is a single RPC, and everything that could go wrong
 * — the format, the collision, the missing player — comes back from it as a
 * named error the admin mapper already knows how to print.
 *
 * THE NEW NAME TRAVELS BACK IN THE RESULT, and the reason is round 12's lesson
 * about client-state markers: `revalidatePath` re-renders the page, and a
 * "saved" flag living in `useActionState` can be unmounted before anybody sees
 * it. The name in `state.name` is what the form re-seeds itself from, so the
 * field agrees with the page even if the marker does not survive.
 */
export async function setDisplayNameAction(
  _prev: PlayerAdminState,
  formData: FormData,
): Promise<PlayerAdminState> {
  await requireAdmin();

  const playerId = String(formData.get("playerId") ?? "");
  if (!playerId) return { status: "error", message: toAdminErrorMessage("PLAYER_NOT_FOUND") };

  const supabase = await createServerSupabaseClient();
  const { data: name, error } = await supabase.rpc("admin_set_display_name", {
    p_player_id: playerId,
    p_nickname: String(formData.get("nickname") ?? ""),
  });

  if (error) return { status: "error", message: toAdminErrorMessage(error.message) };

  revalidatePath(`/admin/players/${playerId}`);
  revalidatePath("/admin/players");
  return { status: "done", name: typeof name === "string" ? name : undefined };
}
