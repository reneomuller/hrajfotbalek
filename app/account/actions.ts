"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/clients";
import { getSessionUser } from "@/lib/auth/session";
import { toBookingErrorCode, type BookingErrorCode } from "@/lib/booking/errors";

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

  const { error } = await supabase.rpc("cancel_booking", {
    p_booking_id: bookingId,
  });

  if (error) {
    return { status: "error", code: toBookingErrorCode(error.message) };
  }

  // The issued credit must show up in the balance immediately — the ledger is
  // the authority and the page recomputes it server-side on the next render.
  revalidatePath("/account");
  return { status: "cancelled" };
}
