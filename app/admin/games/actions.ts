"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { parseGameForm, type GameFormValues } from "@/lib/admin/gameForm";
import type { TransitionState } from "@/lib/admin/actionState";
import { toAdminErrorMessage } from "@/lib/admin/errors";
import { createServerSupabaseClient } from "@/lib/supabase/clients";

/**
 * Games CRUD.
 *
 * EVERY WRITE HERE IS `supabase.rpc()` ON THE ADMIN'S OWN SESSION CLIENT.
 * Not the service-role client: `admin_create_game` and friends accept
 * `is_admin_caller() OR is_service_role()`, so a service-role call satisfies
 * the check regardless of which human triggered the route — which would leave
 * "knowing the URL" as the only real gate. The session client makes the RPC's
 * own check meaningful.
 *
 * `requireAdmin()` runs in each action rather than being inherited from
 * `app/admin/layout.tsx`. A server action is a POST endpoint: it can be invoked
 * without ever rendering a page under that layout, so the layout gate does not
 * reach it.
 */

export interface AdminActionState {
  status: "idle" | "saved" | "error";
  /** Rendered message, already resolved from `lib/strings.ts`. */
  message?: string;
  /** Field-scoped errors keyed by form field name. */
  fieldErrors?: Partial<Record<keyof GameFormValues | "venue", string>>;
  /**
   * Set only when creation SUCCEEDED and the publish that follows it did not
   * (round 7, item 6). The game exists; the form must not imply otherwise, or
   * the organizer resubmits and creates a second one.
   */
  createdGameId?: string;
}

const OK: AdminActionState = { status: "saved" };

/**
 * Create a venue, then a draft game against it — or use an existing venue.
 *
 * Venue creation is folded into this action rather than being its own screen:
 * the organizer's actual task is "add next Sunday's game at the new pitch",
 * and splitting it in two would mean a half-created venue with no game if they
 * stop halfway.
 */
export async function createGameAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin();

  const parsed = parseGameForm(formData);
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors };

  const supabase = await createServerSupabaseClient();
  const values = parsed.values;

  let venueId = values.venueId;

  if (values.newVenueName) {
    const { data, error } = await supabase.rpc("admin_create_venue", {
      p_name: values.newVenueName,
      p_image_path: values.newVenueImagePath,
      p_map_query: values.newVenueMapQuery,
    });
    if (error) {
      return {
        status: "error",
        fieldErrors: { venue: toAdminErrorMessage(error.message) },
      };
    }
    venueId = data as string;
  }

  if (!venueId) {
    return { status: "error", fieldErrors: { venue: toAdminErrorMessage("VENUE_NOT_FOUND") } };
  }

  // v2, not v1 (migration 28). The v1 pair knows nothing about the organizer,
  // and Postgres cannot `create or replace` into a different parameter list —
  // so this is a different function, on the `complete_signup_v2` precedent.
  // The organizer row is written inside that same transaction, which is what
  // makes "organizer name is required" true rather than merely intended.
  const { data: gameId, error } = await supabase.rpc("admin_create_game_v2", {
    p_venue_id: venueId,
    p_starts_at: values.startsAt,
    p_capacity: values.capacity,
    p_price_czk: values.priceCzk,
    p_organizer_name: values.organizerName,
    p_format: values.format,
    p_surface: values.surface,
    p_notes: values.notes,
    p_organizer_phone: values.organizerPhone,
    p_duration_minutes: values.durationMinutes,
    p_allowed_skill_levels: values.allowedSkillLevels,
    p_subs_per_team: values.subsPerTeam,
    p_pitch_name: values.pitchName,
  });

  if (error) {
    return { status: "error", message: toAdminErrorMessage(error.message) };
  }

  /*
   * CREATING A GAME PUBLISHES IT (round 7, item 6).
   *
   * ~~The result is always a draft: creation and publication are separate
   * admin actions so a half-configured game is never publicly visible.~~ In
   * practice there is no half-configured state to protect against — the form
   * validates every field the RPC requires before it is submitted, so the
   * draft that came out the other side was always complete and always
   * immediately published by hand. A second click that has never once been
   * withheld is not a safety step, it is a step.
   *
   * THE DATA MODEL DOES NOT MOVE. `game_status` keeps `draft`, `publish_game`
   * keeps its `game_published` event, and the detail page keeps its Publish
   * button for any draft that already exists. Only the flow changes: the
   * status column is still the thing that decides visibility, and a future
   * round that wants a real draft workflow gets it back by deleting this call.
   *
   * NOT ONE TRANSACTION, AND THAT IS SURVIVABLE. `admin_create_game_v2` and
   * `publish_game` are two round trips; if the second fails the game exists as
   * a draft and the redirect below lands on its admin page with the Publish
   * button showing. That is the pre-round-7 state exactly — recoverable in one
   * click, and visible rather than silent. Merging them into one RPC would be
   * a schema change, which this item explicitly is not.
   */
  const newGameId = gameId as string;
  const { error: publishError } = await supabase.rpc("publish_game", {
    p_game_id: newGameId,
  });

  if (publishError) {
    // The game IS created. Saying otherwise would send the organizer back to
    // a form that would create a second one.
    return {
      status: "error",
      message: toAdminErrorMessage(publishError.message),
      createdGameId: newGameId,
    };
  }

  revalidatePath("/admin/games");
  revalidatePath("/games");
  revalidatePath("/");
  // Straight to the game's admin surface: creating a game is never the last
  // thing the organizer wants to do with it.
  /*
   * `?created=1` IS WHAT MAKES THE NOTIFY OFFER POST-PUBLISH (round 14,
   * item 11). Without it the offer rendered on EVERY published game forever,
   * prefilled with "New game published" — so an organizer opening a fixture
   * from three weeks ago was invited to announce it as new.
   */
  redirect(`/admin/games/${newGameId}?created=1`);
}

/**
 * Edit everything the v2 RPC owns, and capacity separately.
 *
 * `/games` and `/game/[id]` are revalidated below because duration, format,
 * substitutes and the skill badge all render there — an edit that does not
 * reach the public page is an edit the organizer will make twice.
 */
export async function updateGameAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin();

  const gameId = String(formData.get("gameId") ?? "");
  if (!gameId) return { status: "error", message: toAdminErrorMessage("GAME_NOT_FOUND") };

  const parsed = parseGameForm(formData);
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors };

  const supabase = await createServerSupabaseClient();
  const values = parsed.values;

  let venueId = values.venueId;
  if (values.newVenueName) {
    const { data, error } = await supabase.rpc("admin_create_venue", {
      p_name: values.newVenueName,
      p_image_path: values.newVenueImagePath,
      p_map_query: values.newVenueMapQuery,
    });
    if (error) {
      return {
        status: "error",
        fieldErrors: { venue: toAdminErrorMessage(error.message) },
      };
    }
    venueId = data as string;
  }

  if (!venueId) {
    return { status: "error", fieldErrors: { venue: toAdminErrorMessage("VENUE_NOT_FOUND") } };
  }

  const { error } = await supabase.rpc("admin_update_game_v2", {
    p_game_id: gameId,
    p_venue_id: venueId,
    p_starts_at: values.startsAt,
    p_price_czk: values.priceCzk,
    p_organizer_name: values.organizerName,
    p_format: values.format,
    p_surface: values.surface,
    p_notes: values.notes,
    p_organizer_phone: values.organizerPhone,
    p_duration_minutes: values.durationMinutes,
    p_allowed_skill_levels: values.allowedSkillLevels,
    p_subs_per_team: values.subsPerTeam,
    p_pitch_name: values.pitchName,
  });

  if (error) {
    return { status: "error", message: toAdminErrorMessage(error.message) };
  }

  // CAPACITY IS A SEPARATE RPC, not part of the update above. `set_game_capacity`
  // owns the "never below the active-booking count" rule and the fullness
  // resync that follows a capacity change; re-implementing either inside
  // admin_update_game would mean maintaining the rule twice.
  const { error: capacityError } = await supabase.rpc("set_game_capacity", {
    p_game_id: gameId,
    p_capacity: values.capacity,
  });

  if (capacityError) {
    return {
      status: "error",
      fieldErrors: { capacity: toAdminErrorMessage(capacityError.message) },
    };
  }

  revalidatePath("/admin/games");
  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath(`/game/${gameId}`);
  revalidatePath("/games");
  return OK;
}

/** Draft → published, emitting `game_published`. Never automatic. */
export async function publishGameAction(
  _prevState: TransitionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin();

  const gameId = String(formData.get("gameId") ?? "");
  if (!gameId) return { status: "error", message: toAdminErrorMessage("GAME_NOT_FOUND") };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("publish_game", { p_game_id: gameId });

  if (error) {
    return { status: "error", message: toAdminErrorMessage(error.message) };
  }

  revalidatePath("/admin/games");
  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath("/games");
  return OK;
}
