"use server";

import { revalidatePath } from "next/cache";
import { expireOpenCheckouts } from "@/lib/payments/activeExpiry";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { toAdminErrorMessage } from "@/lib/admin/errors";
import { strings } from "@/lib/strings";
import { createServerSupabaseClient } from "@/lib/supabase/clients";

export interface GuestsState {
  status: "idle" | "saved" | "error";
  /** What the game now holds, so the control can render the truth after a save. */
  count?: number;
  message?: string;
}

/**
 * Sets the number of house guests on a game.
 *
 * ONE ACTION FOR ADD AND REMOVE, because a house guest has no identity. The
 * whole point of "Guest 1, Guest 2, Guest 3" is that the second is
 * indistinguishable from the third — so removing one is a decrement, not a
 * deletion of a particular row, and an action per direction would be two names
 * for one arithmetic.
 *
 * THE SESSION CLIENT, NOT SERVICE ROLE. `set_game_guests` accepts
 * `is_admin_caller() OR is_service_role()`, so a service-role call would
 * satisfy it no matter who triggered the route — the same reasoning that put
 * `admin_create_booking` on the admin's own client. `requireAdmin()` above is
 * the route guard; the RPC's own check is the one that cannot be bypassed.
 *
 * CAPACITY IS NOT CHECKED HERE. The RPC counts seats under the game's advisory
 * lock and raises CAPACITY_FULL; checking first would be a read that a
 * concurrent booking can invalidate before the write lands.
 */
export async function setGuestsAction(
  _prevState: GuestsState,
  formData: FormData,
): Promise<GuestsState> {
  await requireAdmin();

  const gameId = String(formData.get("gameId") ?? "");
  if (!gameId) return { status: "error", message: toAdminErrorMessage("GAME_NOT_FOUND") };

  const raw = Number(formData.get("count"));
  if (!Number.isInteger(raw) || raw < 0) {
    return { status: "error", message: toAdminErrorMessage("INVALID_GUEST_COUNT") };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("set_game_guests", {
    p_game_id: gameId,
    p_count: raw,
  });

  if (error) {
    return {
      status: "error",
      message: error.message.includes("CAPACITY_FULL")
        ? strings.admin.guestsNoRoom
        : toAdminErrorMessage(error.message),
    };
  }

  /*
   * ACTIVE EXPIRY, RAIL 3 (round 26, item 1). House guests take real seats, so
   * an admin holding two of them can fill a game while somebody has a payment
   * form open. Killing that session at Stripe stops their money moving.
   */
  await expireOpenCheckouts(gameId);

  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath(`/game/${gameId}`);
  revalidatePath("/games");

  return { status: "saved", count: typeof data === "number" ? data : raw };
}
