"use server";

import { revalidatePath, updateTag } from "next/cache";
import { STABLE_TAGS } from "@/lib/db/stableRead";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import {
  isMapsUrl,
  parseCoordinatePair,
  resolveMapsShareLink,
  toMapQuery,
} from "@/lib/venues/mapsLink";
import { toAdminErrorMessage } from "@/lib/admin/errors";
import { appCapabilities } from "@/lib/db/capabilities";
import type { DeleteState } from "@/app/admin/games/[id]/actions";
import type { TransitionState } from "@/lib/admin/actionState";
import { createServerSupabaseClient } from "@/lib/supabase/clients";
import {
  parsePitchCostForm,
  parsePitchSeason,
  type PitchCostField,
} from "@/lib/admin/venues/pitchCosts";
import type { PitchSeason } from "@/lib/types/database";
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
): Promise<
  | { ok: true; value: string | null; url: string | null }
  | { ok: false; message: string }
> {
  const value = raw.trim();
  if (!value) return { ok: true, value: null, url: null };

  /*
   * COORDINATES FIRST, AND WITHOUT A NETWORK (round 30, item 6). This is what
   * Maps copies on a long-press, it is the most precise thing anybody can hand
   * us, and it needs no round trip — so it is tried before the link path and
   * before search. Normalised through `toMapQuery` so a pasted pair and a
   * resolved link are stored in exactly one format.
   */
  const pasted = parseCoordinatePair(value);
  if (pasted) return { ok: true, value: toMapQuery(pasted), url: null };

  if (!isMapsUrl(value)) return { ok: true, value, url: null };

  const outcome = await resolveMapsShareLink(value);
  /*
   * BOTH HALVES SURVIVE (round 31, item 1). The coordinates go to `map_query`
   * for everything internal; the ORIGINAL LINK goes to `map_url`, because it
   * is the only thing that opens Google's named place card. Round 30 kept the
   * coordinates and threw the provenance away, which is why the player's
   * button opened a screen labelled with raw numbers.
   */
  if (outcome.ok) return { ok: true, value: outcome.mapQuery, url: value };

  return {
    ok: false,
    message:
      outcome.reason === "unreachable"
        ? strings.admin.venueMapUnreachable
        : strings.admin.venueMapUnparseable,
  };
}

/**
 * THE ADDRESS, ITS OWN CALL (round 42), after the venue is saved — the
 * `set_venue_amenities` shape, so neither venue writer is restated. Sent only
 * once the database has it; before that the form does not render the field.
 */
async function saveVenueAddress(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  venueId: string,
  formData: FormData,
): Promise<string | null> {
  if (!formData.has("address") || !(await appCapabilities()).venueAddress) return null;
  const { error } = await supabase.rpc("set_venue_address", {
    p_venue_id: venueId,
    p_address: String(formData.get("address") ?? ""),
  });
  return error ? toAdminErrorMessage(error.message) : null;
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
    p_map_url: mapField.url,
  });

  if (error) return { status: "error", message: toAdminErrorMessage(error.message) };

  if (typeof created === "string") {
    const addressError = await saveVenueAddress(supabase, created, formData);
    if (addressError) return { status: "error", message: addressError, venueId: created };
  }

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
    p_map_url: mapField.url,
    p_pitch_name: String(formData.get("pitchName") ?? "").trim() || null,
  });

  if (error) return { status: "error", message: toAdminErrorMessage(error.message) };

  const addressError = await saveVenueAddress(supabase, venueId, formData);
  if (addressError) return { status: "error", message: addressError };

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

/**
 * Archive and restore a venue (round 39, item 2).
 *
 * ARCHIVE IS WHAT "DELETE VENUE" WAS FOR. A ground worth retiring has games on
 * it, and `admin_delete_venue` rightly refuses those; archiving takes it out of
 * the picker and leaves every game that references it exactly as it was.
 * Reversible, so there is no confirm dialog — Restore is the undo.
 *
 * THE WHOLE LAYOUT IS REVALIDATED: the picker on every game form reads the
 * flag, and so does this page's split into active and archived.
 */
export async function archiveVenueAction(
  _prev: TransitionState,
  formData: FormData,
): Promise<TransitionState> {
  return setVenueArchived(formData, "admin_archive_venue", strings.admin.archiveVenueFailed);
}

export async function restoreVenueAction(
  _prev: TransitionState,
  formData: FormData,
): Promise<TransitionState> {
  return setVenueArchived(formData, "admin_restore_venue", strings.admin.restoreVenueFailed);
}

async function setVenueArchived(
  formData: FormData,
  rpc: "admin_archive_venue" | "admin_restore_venue",
  failed: string,
): Promise<TransitionState> {
  await requireAdmin();

  const venueId = String(formData.get("venueId") ?? "");
  if (!venueId) return { status: "error", message: failed };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc(rpc, { p_venue_id: venueId });

  if (error) return { status: "error", message: toAdminErrorMessage(error.message) };

  revalidatePath("/", "layout");
  return { status: "idle" };
}

/**
 * A venue photo was just replaced (round 41, "venue picture doesn't update").
 *
 * The upload goes straight from the browser to Storage, so no server code
 * sees it — and the photo's URL version is a CACHED listing
 * (`venuePhotoVersion`, sixty seconds). `updateTag` expires that listing NOW,
 * so the `router.refresh()` that follows renders the new URL rather than the
 * one the optimizer already holds. Every page carries venue photos, hence the
 * whole layout.
 */
export async function venuePhotoChangedAction(): Promise<void> {
  await requireAdmin();
  updateTag(STABLE_TAGS.venuePhotos);
  revalidatePath("/", "layout");
}

export interface PitchCostState {
  status: "idle" | "saved" | "error";
  message?: string;
  /** The boxes that did not hold a whole crown amount, so each can say so. */
  invalid?: PitchCostField[];
  /** What was saved — the confirmation names the one new games take. */
  summerCzk?: number;
  winterCzk?: number;
}

/**
 * A venue's summer and winter pitch cost (round 42, the admin rebuild).
 *
 * The owner's ruling: the cost is per game, flat, and a game keeps the cost it
 * was created with — so this changes what games created FROM NOW ON cost, and
 * nothing already on the calendar. `set_venue_pitch_costs` is admin-only and
 * re-checks the range; it is called on the admin's own session, like every
 * other admin write here.
 *
 * THE ADMIN LAYOUT, NOT THE SITE: the pitch tables are not readable by players
 * at all, so nothing outside `/admin` can be showing a stale cost.
 */
export async function saveVenuePitchCostsAction(
  _prev: PitchCostState,
  formData: FormData,
): Promise<PitchCostState> {
  await requireAdmin();

  const venueId = String(formData.get("venueId") ?? "");
  if (!venueId) return { status: "error", message: toAdminErrorMessage("VENUE_NOT_FOUND") };

  const parsed = parsePitchCostForm({
    summer: formData.get("summerCzk"),
    winter: formData.get("winterCzk"),
  });
  if (!parsed.ok) {
    return { status: "error", message: strings.admin.pitchCostOutOfRange, invalid: parsed.invalid };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_venue_pitch_costs", {
    p_venue_id: venueId,
    p_summer_czk: parsed.summerCzk,
    p_winter_czk: parsed.winterCzk,
  });
  if (error) return { status: "error", message: toAdminErrorMessage(error.message) };

  revalidatePath("/admin", "layout");
  return { status: "saved", summerCzk: parsed.summerCzk, winterCzk: parsed.winterCzk };
}

export interface PitchSeasonState {
  status: "idle" | "saved" | "error";
  message?: string;
  season?: PitchSeason;
}

/**
 * The one season switch for every venue (round 42, the admin rebuild).
 *
 * Reversible with the next tap, so there is no dialog: it moves which of each
 * venue's two prices a game created from now on takes, and no existing game's.
 */
export async function setPitchSeasonAction(
  _prev: PitchSeasonState,
  formData: FormData,
): Promise<PitchSeasonState> {
  await requireAdmin();

  const season = parsePitchSeason(formData.get("season"));
  if (!season) return { status: "error", message: strings.admin.pitchSeasonInvalid };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_pitch_season", { p_season: season });
  if (error) return { status: "error", message: toAdminErrorMessage(error.message) };

  revalidatePath("/admin", "layout");
  return { status: "saved", season };
}
