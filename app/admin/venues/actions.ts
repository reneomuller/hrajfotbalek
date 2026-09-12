"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { isMapsUrl, resolveMapsShareLink } from "@/lib/venues/mapsLink";
import { toAdminErrorMessage } from "@/lib/admin/errors";
import type { DeleteState } from "@/app/admin/games/[id]/actions";
import { createServerSupabaseClient } from "@/lib/supabase/clients";
import { strings } from "@/lib/strings";

/**
 * Turn whatever is in the map field into something Maps can actually find
 * (round 30, item 4).
 *
 * A PLACE NAME IS LEFT ALONE. Search is the fallback and always was — the
 * field's label still says "Map search" — so anything that is not a Google URL
 * passes straight through and behaves exactly as it did before this round.
 *
 * A LINK THAT WILL NOT RESOLVE IS REFUSED IN WORDS, not silently stored. That
 * is the item's own instruction and the difference between this and what was
 * there before: pasting a short link used to "work", storing the URL text as a
 * search query that Maps then looked for as words and found nothing. A failure
 * a user cannot see is worse than one they can.
 */
async function resolveMapField(
  raw: string,
): Promise<{ ok: true; value: string | null } | { ok: false; message: string }> {
  const value = raw.trim();
  if (!value) return { ok: true, value: null };
  if (!isMapsUrl(value)) return { ok: true, value };

  const outcome = await resolveMapsShareLink(value);
  if (outcome.ok) return { ok: true, value: outcome.mapQuery };

  return {
    ok: false,
    message:
      outcome.reason === "unreachable"
        ? strings.admin.venueMapUnreachable
        : strings.admin.venueMapUnparseable,
  };
}

export interface VenueFormState {
  status: "idle" | "saved" | "created" | "error";
  message?: string;
  /**
   * The venue that was just created (round 30, item 1).
   *
   * THE CREATE FORM NEEDS IT TO OFFER THE PHOTO. `set_venue_photo` takes a
   * venue id, so a create form had nothing to upload against and the pitch
   * photo was an EDIT-only control — which is why the owner's "create a venue,
   * crop the photo" was two trips through the list. The id comes back with the
   * success and the photo step appears in place.
   */
  venueId?: string;
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
  const mapField = await resolveMapField(String(formData.get("mapQuery") ?? ""));
  if (!mapField.ok) return { status: "error", message: mapField.message };

  const { data: created, error } = await supabase.rpc("admin_create_venue", {
    p_name: name,
    // The photo is an UPLOAD on the row once it exists, so nothing is passed
    // here — `image_path` is a bucket key `set_venue_photo` writes, and a
    // create form has no id to upload against yet.
    p_map_query: mapField.value,
  });

  if (error) return { status: "error", message: toAdminErrorMessage(error.message) };

  revalidatePath("/admin/venues");
  return {
    status: "created",
    venueId: typeof created === "string" ? created : undefined,
  };
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

  // The EDIT flow resolves a pasted link exactly as the create flow does —
  // the owner's item names both, and one of them behaving differently is how a
  // feature gets reported as broken on the surface that was missed.
  const mapField = await resolveMapField(String(formData.get("mapQuery") ?? ""));
  if (!mapField.ok) return { status: "error", message: mapField.message };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("admin_update_venue", {
    p_venue_id: venueId,
    p_name: name,
    p_map_query: mapField.value,
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
