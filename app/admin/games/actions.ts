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

  const { data: gameId, error } = await supabase.rpc("admin_create_game", {
    p_venue_id: venueId,
    p_starts_at: values.startsAt,
    p_capacity: values.capacity,
    p_price_czk: values.priceCzk,
    p_format: values.format,
    p_surface: values.surface,
    p_notes: values.notes,
  });

  if (error) {
    return { status: "error", message: toAdminErrorMessage(error.message) };
  }

  revalidatePath("/admin/games");
  // Straight to the game's admin surface: creating a game is never the last
  // thing the organizer wants to do with it.
  redirect(`/admin/games/${gameId as string}`);
}

/** Edit venue/time/price/format/surface/notes, and capacity separately. */
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

  const { error } = await supabase.rpc("admin_update_game", {
    p_game_id: gameId,
    p_venue_id: venueId,
    p_starts_at: values.startsAt,
    p_price_czk: values.priceCzk,
    p_format: values.format,
    p_surface: values.surface,
    p_notes: values.notes,
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
