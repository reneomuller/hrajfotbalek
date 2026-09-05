import { stripeClient } from "@/lib/payments/embeddedCheckout";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";

/**
 * Kill every open checkout for a game that can no longer honour one
 * (round 26, item 1).
 *
 * THIS IS THE PRIMARY DEFENCE, not the credit path. When a game reaches
 * capacity — by any rail — the forms already on other people's screens are
 * expired at Stripe, so a later payer's card is refused by Stripe itself with
 * "session expired" and **no money moves at all**. The credit fallback in
 * `settle_checkout_session` exists for the same-instant residual: two people
 * completing inside one lock window, which this cannot reach in time.
 *
 * IT IS CALLED FROM EVERY RAIL THAT CAN FILL A GAME, and that list is the
 * whole correctness argument:
 *
 *   * the Stripe webhook, after it creates a booking
 *   * `createBookingAction`, after a credit redemption
 *   * the admin's own booking creation
 *
 * A rail that fills a game and forgets to call this does not corrupt anything —
 * it just leaves somebody to be credited instead of stopped, which is the
 * degradation this design chose.
 *
 * BEST EFFORT, DELIBERATELY. Nothing here is allowed to fail the transaction
 * that filled the game: a booking that succeeded must not be rolled back
 * because Stripe was slow. Failures are logged and the credit path catches
 * whatever slips through — which is exactly what it is for.
 */
export async function expireOpenCheckouts(gameId: string): Promise<number> {
  const stripe = stripeClient();
  if (!stripe) return 0;

  const supabase = createServiceRoleSupabaseClient();

  const { data, error } = await supabase.rpc("checkouts_to_expire", {
    p_game_id: gameId,
  });

  if (error) {
    // PGRST202 is "no such function", the known pre-migration state.
    if (error.code !== "PGRST202") {
      console.error("active expiry: could not list checkouts", error.message);
    }
    return 0;
  }

  const sessions = (data ?? []) as { stripe_session_id: string }[];
  let expired = 0;

  for (const row of sessions) {
    try {
      await stripe.checkout.sessions.expire(row.stripe_session_id);
      await supabase.rpc("mark_checkout_expired", {
        p_stripe_session_id: row.stripe_session_id,
      });
      expired += 1;
    } catch (cause) {
      /*
       * ALREADY COMPLETED IS NOT A FAILURE. Stripe refuses to expire a session
       * that has been paid, which is the race this whole design is about — and
       * that payment is on its way to `settle_checkout_session`, which will
       * credit it. Logged at info-level shape rather than as an error, because
       * an operator grepping for problems should not find the normal case.
       */
      const message = cause instanceof Error ? cause.message : String(cause);
      console.error("active expiry: could not expire", row.stripe_session_id, message);
    }
  }

  return expired;
}
