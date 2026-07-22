"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { validateNickname } from "@/lib/auth/nickname";
import { toAdminErrorMessage } from "@/lib/admin/errors";
import { toBookingErrorCode } from "@/lib/booking/errors";
import { strings } from "@/lib/strings";
import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/clients";
import type { BookingResult, ClientPaymentMethod } from "@/lib/types/database";

export interface AddPlayerState {
  status: "idle" | "added" | "duplicate" | "error";
  /** The existing player's id, so the duplicate case can link into merge. */
  existingPlayerId?: string;
  /** What the booking actually came out as — may not be what was asked for. */
  paymentMethod?: BookingResult["payment_method"];
  message?: string;
  fieldErrors?: { nickname?: string; email?: string };
}

/**
 * Add a shadow player and book them, in one action.
 *
 * TWO WRITES, TWO DIFFERENT ROUTES, AND THE ASYMMETRY IS THE POINT:
 *
 *   1. The `players` row is a BASE ROW and is inserted directly. It carries no
 *      state machine, no ledger, no event that has to land with it. It uses the
 *      service-role client because `players` grants no INSERT to `authenticated`
 *      — there is no player-facing path that creates another player.
 *
 *   2. The booking goes through `admin_create_booking` ON THE ADMIN'S OWN
 *      SESSION CLIENT. Not `create_booking`: that one derives identity from
 *      `auth.uid()` and rejects a client-supplied player id by design, and the
 *      admin is not the player being booked. Not the service-role client
 *      either: `admin_create_booking` accepts `is_admin_caller() OR
 *      is_service_role()`, so a service-role call would satisfy it no matter
 *      who triggered the route.
 *
 * ONLY `qr`/`cash` ARE EVER SENT. A seed player still comes back `seed_free`
 * and a shadow with a covering balance still comes back `credit`, because the
 * RPC derives the method from the player and the wallet. Admin privilege
 * widens who can be booked, never what the booking costs.
 */
export async function addPlayerAction(
  _prevState: AddPlayerState,
  formData: FormData,
): Promise<AddPlayerState> {
  await requireAdmin();

  const gameId = String(formData.get("gameId") ?? "");
  if (!gameId) return { status: "error", message: toAdminErrorMessage("GAME_NOT_FOUND") };

  const rawNickname = String(formData.get("nickname") ?? "").trim();
  const rawEmail = String(formData.get("email") ?? "").trim();
  const rawMethod = formData.get("method");
  const method: ClientPaymentMethod = rawMethod === "cash" ? "cash" : "qr";

  const nickname = validateNickname(rawNickname);
  if (!nickname.valid) {
    return { status: "error", fieldErrors: { nickname: strings.auth.nicknameInvalid } };
  }

  const email = rawEmail === "" ? null : rawEmail.toLowerCase();

  const service = createServiceRoleSupabaseClient();

  // --- duplicate identity, checked BEFORE anything is written ----------------
  // Not a race-free guarantee — the partial unique index on lower(email) is
  // that — but the index would surface as a constraint violation, and the
  // useful answer here is "here is who that already is, go and merge".
  if (email) {
    const { data: existing } = await service
      .from("players")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (existing) {
      return { status: "duplicate", existingPlayerId: existing.id };
    }
  }

  const { data: player, error: insertError } = await service
    .from("players")
    .insert({
      nickname: nickname.value,
      email,
      // Explicit rather than relying on the default: a shadow player is
      // DEFINED by having no auth user, and that is the whole point of the row.
      auth_user_id: null,
    })
    .select("id")
    .single();

  if (insertError || !player) {
    // The nickname index is case-insensitive and the CHECK is already
    // satisfied, so a failure here is almost always a name clash.
    return {
      status: "error",
      fieldErrors: { nickname: strings.admin.addPlayerNicknameTaken },
    };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("admin_create_booking", {
    p_game_id: gameId,
    p_player_id: player.id,
    p_payment_method: method,
  });

  if (error) {
    // The player row survives a failed booking on purpose: the identity is
    // real and reusable, and deleting it here would race with anything that
    // already referenced it. The admin can book them from the roster.
    const code = toBookingErrorCode(error.message);
    return {
      status: "error",
      message:
        code === "CAPACITY_FULL"
          ? strings.admin.addPlayerFull
          : toAdminErrorMessage(error.message),
    };
  }

  const result = data as unknown as BookingResult | null;

  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath(`/game/${gameId}`);

  return { status: "added", paymentMethod: result?.payment_method };
}
