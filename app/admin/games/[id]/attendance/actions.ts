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

/*
 * ~~`settleGameAction` — close the books.~~ REMOVED (round 29).
 *
 * Settling is no longer an act. The daily sweep takes a game from `published`
 * to `played` to `settled` in one run, and `settle_game` is dropped from the
 * database — so there is nothing for an action to call and no button to call
 * it from. See `20260909120000_auto_settle.sql` for the reversal's lineage.
 *
 * WHAT THIS ACTION DID THAT IS NOT LOST: on refusal it named the unpaid
 * bookings, which a raise cannot. The sweep keeps that information — it
 * reports `skipped` and the game ids, and the cron route logs them — and the
 * admin game page still lists the outstanding names on a `played` game that
 * has not closed.
 */
