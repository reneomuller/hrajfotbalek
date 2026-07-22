"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import type { TransitionState } from "@/lib/admin/actionState";
import { toAdminErrorMessage } from "@/lib/admin/errors";
import { createServerSupabaseClient } from "@/lib/supabase/clients";
import type { AttendanceStatus } from "@/lib/types/database";

export interface AttendanceState {
  status: "idle" | "saved" | "blocked" | "error";
  /** Nicknames of the bookings still unpaid, when settle was refused. */
  outstanding?: string[];
  message?: string;
}

/**
 * Mark one booking present or no-show.
 *
 * `supabase.rpc('mark_attendance', …)` on the admin's session client — there is
 * no `.update()` on `bookings` anywhere in this flow. The column and its
 * `attendance_marked` event have to land together, and only the function can
 * promise that.
 */
export async function markAttendanceAction(
  _prevState: AttendanceState,
  formData: FormData,
): Promise<AttendanceState> {
  await requireAdmin();

  const bookingId = String(formData.get("bookingId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  const raw = String(formData.get("attendance") ?? "");
  const attendance: AttendanceStatus | null =
    raw === "present" || raw === "no_show" ? raw : null;

  if (!bookingId || !attendance) {
    return { status: "error", message: toAdminErrorMessage("BOOKING_NOT_FOUND") };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("mark_attendance", {
    p_booking_id: bookingId,
    p_attendance: attendance,
  });

  if (error) return { status: "error", message: toAdminErrorMessage(error.message) };

  revalidatePath(`/admin/games/${gameId}/attendance`);
  revalidatePath(`/admin/games/${gameId}`);
  return { status: "saved" };
}

/** `published`/`full` → `played`. The game happened; the books are still open. */
export async function markPlayedAction(
  _prevState: TransitionState,
  formData: FormData,
): Promise<AttendanceState> {
  await requireAdmin();

  const gameId = String(formData.get("gameId") ?? "");
  if (!gameId) return { status: "error", message: toAdminErrorMessage("GAME_NOT_FOUND") };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("mark_game_played", { p_game_id: gameId });

  if (error) return { status: "error", message: toAdminErrorMessage(error.message) };

  revalidatePath(`/admin/games/${gameId}/attendance`);
  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath("/admin/games");
  return { status: "saved" };
}

/**
 * Close the books.
 *
 * THE UNPAID-RESERVATION BLOCK IS IN `settle_game`, not here. This action's job
 * on refusal is to name the bookings, which is the part a UI is better at than
 * a raise — the RPC counts them under the game lock, and this reads them back
 * afterwards for the message. A check performed only here would hold until the
 * next caller of `settle_game` from anywhere else.
 */
export async function settleGameAction(
  _prevState: AttendanceState,
  formData: FormData,
): Promise<AttendanceState> {
  await requireAdmin();

  const gameId = String(formData.get("gameId") ?? "");
  if (!gameId) return { status: "error", message: toAdminErrorMessage("GAME_NOT_FOUND") };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("settle_game", { p_game_id: gameId });

  if (error) {
    if (error.message.includes("RESERVED_BOOKINGS_REMAIN")) {
      const { unpaidBookings, listGameBookings } = await import("@/lib/admin/queries");
      const outstanding = unpaidBookings(await listGameBookings(gameId)).map(
        (booking) => booking.nickname,
      );
      return { status: "blocked", outstanding };
    }
    return { status: "error", message: toAdminErrorMessage(error.message) };
  }

  revalidatePath(`/admin/games/${gameId}/attendance`);
  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath("/admin/games");
  return { status: "saved" };
}
