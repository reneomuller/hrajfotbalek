"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { notifyWaitlistForGame } from "@/lib/cron/waitlistRelease";
import { createServerSupabaseClient } from "@/lib/supabase/clients";
import { getSessionUser } from "@/lib/auth/session";
import { toBookingErrorCode, type BookingErrorCode } from "@/lib/booking/errors";

/**
 * Sign out.
 *
 * `signOut()` on the server client clears the session cookies through the
 * cookie adapter, so the browser is genuinely logged out rather than merely
 * navigated away — a client-side redirect would leave the session intact and
 * the next visit would silently be authenticated again.
 *
 * Scope is local: it ends this browser's session, not every session the player
 * holds. Signing a player out of their other devices is a security action they
 * did not ask for here.
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}

export interface CancelActionState {
  status: "idle" | "cancelled" | "error";
  code?: BookingErrorCode;
}

/**
 * Self-cancel.
 *
 * The write goes through `cancel_booking`, which owns the whole decision:
 * ownership, the cancellation window, and how much credit to issue for money
 * actually applied. Nothing about that is re-implemented here.
 *
 * The UI disables the cancel affordance after kickoff for a decent experience,
 * but that is a MIRROR of the rule, not the rule. A UI that merely hides the
 * button while the RPC would still accept the call is a security defect rather
 * than a cosmetic one — so this action always calls the RPC and always renders
 * whatever it decides, including a `CANCEL_WINDOW_CLOSED` refusal for a
 * request that reached here anyway.
 */
export async function cancelBookingAction(
  _prevState: CancelActionState,
  formData: FormData,
): Promise<CancelActionState> {
  const bookingId = String(formData.get("bookingId") ?? "");
  if (!bookingId) return { status: "error", code: "BOOKING_NOT_FOUND" };

  const user = await getSessionUser();
  if (!user) return { status: "error", code: "INSUFFICIENT_PERMISSION" };

  const supabase = await createServerSupabaseClient();

  // Read the game before cancelling: afterwards the booking still carries the
  // id, but reading it first keeps the release step independent of whatever
  // the RPC returns.
  const { data: booking } = await supabase
    .from("bookings")
    .select("game_id")
    .eq("id", bookingId)
    .maybeSingle();

  const { error } = await supabase.rpc("cancel_booking", {
    p_booking_id: bookingId,
  });

  if (error) {
    return { status: "error", code: toBookingErrorCode(error.message) };
  }

  // A cancellation releases a spot, and `cancel_booking` emits `spot_released`
  // to say so. Notifying here rather than waiting for the next cron tick is
  // what makes the loop hands-free: cancel -> credit -> release -> notify ->
  // convert, with no human and no 15-minute wait in the middle.
  //
  // Failure to mail must never fail the cancellation — the money movement is
  // already committed, and the waitlist is re-notified on the next release.
  if (booking?.game_id) {
    try {
      await notifyWaitlistForGame(booking.game_id);
    } catch (notifyError) {
      console.error("waitlist notify after cancellation failed", notifyError);
    }
  }

  // The issued credit must show up in the balance immediately — the ledger is
  // the authority and the page recomputes it server-side on the next render.
  revalidatePath("/account");
  return { status: "cancelled" };
}
