"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { stripeBookingUrl, withStripeParams } from "@/lib/payments/stripeLinks";
import { createServerSupabaseClient } from "@/lib/supabase/clients";

export interface RetryState {
  status: "idle" | "gone" | "error";
}

/**
 * "Try again" on a booking that is waiting for — or has stopped waiting for —
 * an online payment.
 *
 * TWO THINGS HAPPEN IN THIS ORDER AND THE ORDER IS THE POINT.
 *
 *   1. `retry_online_payment` re-holds the seats, under the game's advisory
 *      lock, and answers FALSE if they went while the player was away.
 *   2. Only then is the player sent back to Stripe.
 *
 * Doing it the other way round — or not doing step 1 at all — sends somebody
 * to pay for a seat that no longer exists, and manufactures the
 * needs-attention case the webhook exists to handle. The retry is the one
 * moment in this flow where we can still say "no" for free.
 *
 * THE SAME `client_reference_id`, deliberately. It is the same booking, and
 * reconciliation is manual: a second reference for one seat is two lines in
 * the Stripe dashboard that nobody can tell apart.
 */
export async function retryPaymentAction(
  _prevState: RetryState,
  formData: FormData,
): Promise<RetryState> {
  const bookingId = String(formData.get("bookingId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  if (!bookingId || !gameId) return { status: "error" };

  const payUrl = stripeBookingUrl();
  // The option is not offered when there is nowhere to send anyone, and this
  // is the other case: a stale tab from before the variable was cleared.
  if (!payUrl) return { status: "error" };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("retry_online_payment", {
    p_booking_id: bookingId,
  });

  if (error) return { status: "error" };
  if (data === false) return { status: "gone" };

  const user = await getSessionUser();
  const stamped = withStripeParams(payUrl, {
    reference: bookingId,
    email: user?.email ?? null,
  });

  if (!stamped) return { status: "error" };
  redirect(stamped);
}
