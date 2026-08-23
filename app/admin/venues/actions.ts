"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { toAdminErrorMessage } from "@/lib/admin/errors";
import type { DeleteState } from "@/app/admin/games/[id]/actions";
import { createServerSupabaseClient } from "@/lib/supabase/clients";
import { strings } from "@/lib/strings";

export interface VenueFormState {
  status: "idle" | "saved" | "created" | "error";
  message?: string;
}

/**
 * Create and edit venues (round 13, item 24).
 *
 * BOTH GO THROUGH THE ADMIN'S OWN SESSION CLIENT, not the service-role one:
 * `admin_create_venue` and `admin_update_venue` accept
 * `is_admin_caller() OR is_service_role()`, so a service-role call would
 * satisfy the check no matter which human triggered the route. Same rule as
 * every other admin action here.
 */

export async function createVenueAction(
  _prev: VenueFormState,
  formData: FormData,
): Promise<VenueFormState> {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { status: "error", message: toAdminErrorMessage("VENUE_NAME_REQUIRED") };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("admin_create_venue", {
    p_name: name,
    // The photo is an UPLOAD on the row once it exists, so nothing is passed
    // here — `image_path` is a bucket key `set_venue_photo` writes, and a
    // create form has no id to upload against yet.
    p_map_query: String(formData.get("mapQuery") ?? "").trim() || null,
  });

  if (error) return { status: "error", message: toAdminErrorMessage(error.message) };

  revalidatePath("/admin/venues");
  return { status: "created" };
}

export async function updateVenueAction(
  _prev: VenueFormState,
  formData: FormData,
): Promise<VenueFormState> {
  await requireAdmin();

  const venueId = String(formData.get("venueId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!venueId) return { status: "error", message: toAdminErrorMessage("VENUE_NOT_FOUND") };
  if (!name) return { status: "error", message: toAdminErrorMessage("VENUE_NAME_REQUIRED") };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("admin_update_venue", {
    p_venue_id: venueId,
    p_name: name,
    p_map_query: String(formData.get("mapQuery") ?? "").trim() || null,
    p_pitch_name: String(formData.get("pitchName") ?? "").trim() || null,
  });

  if (error) return { status: "error", message: toAdminErrorMessage(error.message) };

  /*
   * THE WHOLE SITE, not just this page. A venue's name and photo reach every
   * game card and every game page that reads its row — and its amenities
   * reach the "What's included" block on each of them.
   */
  revalidatePath("/", "layout");
  return { status: "saved" };
}

/**
 * Delete a venue (round 16, item 18).
 *
 * IT REFUSES A VENUE WITH GAMES, in SQL. `games.venue_id` is a real reference
 * and a game whose venue vanished renders a blank where a name should be —
 * which is not a crash, and is therefore the kind of breakage nobody notices
 * for a week. The refusal names the next step rather than the problem.
 *
 * SHARES `DeleteState` WITH THE GAME DELETE so one dialog component drives
 * both. The two refusals differ; the shape does not.
 */
export async function deleteVenueAction(
  _prev: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  await requireAdmin();

  const venueId = String(formData.get("venueId") ?? "");
  if (!venueId) return { status: "error", message: strings.admin.deleteVenueFailed };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("admin_delete_venue", { p_venue_id: venueId });

  if (error) return { status: "error", message: toAdminErrorMessage(error.message) };

  // A venue reaches every card that names it, so the whole layout is stale.
  revalidatePath("/", "layout");
  return { status: "idle" };
}
