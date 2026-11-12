import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";

/**
 * WHETHER A `?paid=<session>` FLAG IS A REAL PAYMENT FOR THIS BOOKING
 * (2026-11-12, a correction to the GTM v4 patch).
 *
 * The flag arrives in the address bar, so anybody could add `?paid=cs_…` to
 * their own confirmation link and push a `purchase` GA4 would book as revenue.
 * Before the page reports one, the Checkout Session must exist, be `booked`
 * (paid and seated — `settle_checkout_session`), and belong to this player and
 * this booking. Its own `amount_czk` is then the purchase value: what Stripe
 * actually charged, rather than a figure worked back from the booking.
 *
 * Read with the service role: `checkout_sessions` grants players nothing. The
 * page has already proved the booking is the caller's own.
 */
export async function paidCheckoutAmount(input: {
  sessionId: string;
  bookingId: string;
  playerId: string;
}): Promise<number | null> {
  const service = createServiceRoleSupabaseClient();
  const { data, error } = await service
    .from("checkout_sessions")
    .select("amount_czk")
    .eq("stripe_session_id", input.sessionId)
    .eq("booking_id", input.bookingId)
    .eq("player_id", input.playerId)
    .eq("status", "booked")
    .maybeSingle();
  if (error || !data) return null;
  return data.amount_czk;
}

/** How recent a booking must be for `?booked=1` to report it. */
const JUST_BOOKED_MS = 60 * 60 * 1000;

/**
 * Whether `?booked=1` may report this booking: made within the hour. The clock
 * is read here, in the data layer, never during a render.
 */
export function bookedJustNow(createdAt: string, now: number = Date.now()): boolean {
  return now - Date.parse(createdAt) < JUST_BOOKED_MS;
}
