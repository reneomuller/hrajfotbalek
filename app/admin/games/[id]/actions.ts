"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { parseUnderpayment, toAdminErrorMessage } from "@/lib/admin/errors";
import { createServerSupabaseClient } from "@/lib/supabase/clients";
import type { ConfirmResult } from "@/lib/types/database";

export interface ConfirmPaymentState {
  status: "idle" | "confirmed" | "underpaid" | "error";
  /** Surplus turned into wallet credit. Present on an overpayment. */
  creditIssuedCzk?: number;
  /** How far short the payment fell. Present on an underpayment. */
  shortfallCzk?: number;
  /** True when the payment landed on an already-expired booking. */
  wasExpired?: boolean;
  message?: string;
}

/**
 * One-tap ✓ Paid, and the amount-differs path behind it.
 *
 * ALL RECONCILIATION LOGIC IS IN `confirm_booking`. This action supplies an
 * amount (or omits it) and renders what comes back. It does not decide what an
 * overpayment means, does not compute credit, and does not decide whether an
 * expired booking gets its spot back — the answers are, respectively: wallet
 * credit, the RPC's arithmetic, and never.
 *
 * `received_amount_czk` is OMITTED on the one-tap path, which is what tells
 * the RPC "confirm at the expected amount". Sending the expected amount
 * explicitly would look equivalent and is not: it would make the tap a claim
 * about what the bank reported, and this tap is not that claim.
 *
 * `p_confirmed_by` carries the acting admin's player id into the
 * `payment_confirmed` event. Metadata for the audit trail, never
 * authorization — the RPC decides that from the session it runs under.
 */
export async function confirmPaymentAction(
  _prevState: ConfirmPaymentState,
  formData: FormData,
): Promise<ConfirmPaymentState> {
  const admin = await requireAdmin();

  const bookingId = String(formData.get("bookingId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  if (!bookingId) return { status: "error", message: toAdminErrorMessage("BOOKING_NOT_FOUND") };

  // Present only on the amount-differs path.
  const rawAmount = String(formData.get("receivedAmount") ?? "").trim();
  const receivedAmount = rawAmount === "" ? null : Number(rawAmount);

  if (receivedAmount !== null && (!Number.isInteger(receivedAmount) || receivedAmount < 0)) {
    return { status: "error", message: toAdminErrorMessage("INVALID_PRICE") };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("confirm_booking", {
    p_booking_id: bookingId,
    p_confirmed_by: admin.id,
    p_received_amount_czk: receivedAmount,
  });

  if (error) {
    // The RPC refuses a partial payment and rolls back, so the booking is
    // still held and unpaid. The shortfall is reported from the detail it
    // raised with rather than recomputed here, so the number the admin sees is
    // the number the function actually compared.
    const shortfall = parseUnderpayment(error.message);
    if (shortfall !== null) {
      return { status: "underpaid", shortfallCzk: shortfall };
    }
    return { status: "error", message: toAdminErrorMessage(error.message) };
  }

  const result = data as unknown as ConfirmResult | null;

  if (gameId) {
    revalidatePath(`/admin/games/${gameId}`);
    revalidatePath(`/game/${gameId}`);
  }

  return {
    status: "confirmed",
    creditIssuedCzk: result?.credit_issued_czk ?? 0,
    // `expired` coming back from a confirm is the payment-after-expiry path:
    // credited in full, spot not reinstated, and the UI must not offer one.
    wasExpired: result?.status === "expired",
  };
}
