"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/clients";
import { requireCurrentPlayer } from "@/lib/auth/session";
import { notifyWaitlistForGame } from "@/lib/cron/waitlistRelease";
import { policy } from "@/lib/policy";
import type { CancelGuestsState } from "@/lib/booking/cancelGuests";

/**
 * TAKE GUESTS BACK OFF A BOOKING (round 34, item 4).
 *
 * THE AUTHORITY IS `cancel_guests`, NOT THIS FILE. It re-checks ownership, the
 * booking's status, the game's window and the count — under the player's and
 * the game's advisory locks, in that order — and it decides what the refund is
 * worth. A route guard is skipped by anyone using curl; everything that matters
 * here happens inside the function.
 *
 * WHAT THIS FILE ADDS IS THE THING SQL CANNOT DO: telling the waitlist. A
 * cancellation frees seats, and `cancel_guests` emits `spot_released` to say
 * so — but the notification is sent from the application, exactly as
 * `cancelBookingAction` sends it. Notifying here rather than waiting for the
 * next cron tick is what makes the loop hands-free.
 *
 * A FAILURE TO NOTIFY MUST NEVER FAIL THE CANCELLATION. The seats are already
 * free and the credit is already committed by the time this runs; the waitlist
 * is re-notified on the next release either way.
 */
export async function cancelGuestsAction(
  _prev: CancelGuestsState,
  formData: FormData,
): Promise<CancelGuestsState> {
  const gameId = String(formData.get("gameId") ?? "");
  const bookingId = String(formData.get("bookingId") ?? "");

  /*
   * CLAMPED THE WAY EVERY OTHER GUEST COUNT IN THIS PRODUCT IS. A garbled value
   * must not become a large one — and here "large" would mean removing guests
   * the player does not have, which `cancel_guests` refuses anyway. This is the
   * cheap half of the same answer.
   */
  const raw = Number(formData.get("guests"));
  const guests =
    Number.isInteger(raw) && raw > 0
      ? Math.min(raw, policy.booking.maxPartyGuests)
      : 0;

  if (!gameId || !bookingId || guests < 1) {
    return { status: "error", code: "FAILED" };
  }

  await requireCurrentPlayer(`/game/${gameId}`);
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.rpc("cancel_guests", {
    p_booking_id: bookingId,
    p_count: guests,
  });

  if (error) {
    const message = error.message ?? "";
    if (message.includes("CANCEL_WINDOW_CLOSED")) {
      return { status: "error", code: "CANCEL_WINDOW_CLOSED" };
    }
    if (message.includes("INVALID_GUEST_COUNT")) {
      return { status: "error", code: "INVALID_GUEST_COUNT" };
    }
    console.error("cancel guests refused", { booking: bookingId, message });
    return { status: "error", code: "FAILED" };
  }

  try {
    await notifyWaitlistForGame(gameId);
  } catch (notifyError) {
    console.error("waitlist notify after guest removal failed", notifyError);
  }

  /*
   * THREE PATHS, BECAUSE THE CREDIT AND THE ROSTER LIVE ON DIFFERENT PAGES.
   * A refund shows on `/account`, the lineup on the game page, and the booking
   * row on `/my-games`; revalidating one of the three leaves the others stale,
   * which reads as "the money did not come back".
   */
  revalidatePath(`/game/${gameId}`);
  revalidatePath("/account");
  revalidatePath("/my-games");

  /*
   * BACK TO THE GAME, WHICH IS WHERE THE EVIDENCE IS. Unlike adding guests
   * there is no purchase to confirm — the thing that happened is a shorter
   * lineup, and the roster is one scroll from this control. `removed` drives a
   * toast; nothing downstream reads it.
   *
   * REDIRECTED RATHER THAN FLAGGED: `revalidatePath` unmounts anything this
   * action returns before it can be read (CLAUDE.md, round 12).
   */
  redirect(`/game/${gameId}?removed=${guests}`);
}
