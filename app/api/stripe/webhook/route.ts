import { NextResponse } from "next/server";
import {
  minorUnitsToCzk,
  parseCheckoutSession,
  verifyStripeSignature,
} from "@/lib/payments/stripeWebhook";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";

export const dynamic = "force-dynamic";

/**
 * `POST /api/stripe/webhook` — the only thing that turns an online booking
 * into a paid one.
 *
 * THE PROBLEM IT SOLVES. Choosing "Online payment" creates a booking and hands
 * the player to a Stripe Payment Link. Nothing was watching the other end, so
 * a player who pressed the back arrow kept the seats and never paid, forever.
 * Migration `20260821200000` gives such a booking a thirty-minute window;
 * this route is what stops the clock.
 *
 * ALWAYS 200 EXCEPT ON A BAD SIGNATURE. Stripe retries a non-2xx with
 * exponential backoff for days, so a 500 on something that can never succeed —
 * an unknown reference, a test event, a booking already settled — is a retry
 * storm rather than a fix. Those answer 200 with a body naming what happened.
 * A bad signature answers 400, because that one is not Stripe.
 *
 * THE HANDLER DECIDES NOTHING. It verifies, parses, converts, and calls
 * `confirm_online_payment`, which answers every question that matters under
 * the game's advisory lock: is this a redelivery, did enough money arrive, is
 * there still a seat. A check made here would be a check made outside the
 * lock, which is a check that a concurrent booking can invalidate between the
 * reading and the writing.
 *
 * SETUP IS THREE STEPS IN THE STRIPE DASHBOARD and one in Vercel — they are in
 * `docs/REQUESTS.md` §6 and in the round 12 report. Until `STRIPE_WEBHOOK_SECRET`
 * is set this route refuses everything, which is the correct posture: an
 * endpoint that confirms bookings and cannot verify who is asking must not
 * confirm anything.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // Not 500: nothing is broken, the endpoint is simply not configured yet.
    // 503 tells Stripe to retry, which is right — the secret may appear.
    console.error("stripe webhook: STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  /*
   * THE RAW BODY, AND IT MUST STAY RAW. The MAC is computed over the exact
   * bytes Stripe signed; `request.json()` would parse and any re-serialisation
   * would reorder keys and drop whitespace, breaking every signature. This is
   * the single most common way a webhook integration fails.
   */
  const payload = await request.text();

  const verified = verifyStripeSignature(
    payload,
    request.headers.get("stripe-signature"),
    secret,
  );

  if (!verified.ok) {
    console.error("stripe webhook: signature rejected", { reason: verified.reason });
    return NextResponse.json({ error: verified.reason }, { status: 400 });
  }

  const session = parseCheckoutSession(payload);

  // A verified event of a type we do not handle. Stripe sends whatever the
  // endpoint is subscribed to, and answering 200 stops it retrying an event
  // this product has no opinion about.
  if (!session) {
    return NextResponse.json({ ok: true, ignored: "unhandled_event" });
  }

  if (!session.clientReferenceId) {
    console.error("stripe webhook: session carries no client_reference_id", {
      session: session.id,
    });
    return NextResponse.json({ ok: true, ignored: "no_reference" });
  }

  if (session.amountTotal === null) {
    console.error("stripe webhook: session carries no amount_total", {
      session: session.id,
    });
    return NextResponse.json({ ok: true, ignored: "no_amount" });
  }

  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase.rpc("confirm_online_payment", {
    p_booking_id: session.clientReferenceId,
    p_session_id: session.id,
    p_amount_czk: minorUnitsToCzk(session.amountTotal),
  });

  if (error) {
    /*
     * A GENUINE FAILURE, AND THE ONE CASE WHERE A RETRY HELPS. The database
     * was unreachable, or the reference was not a uuid and PostgREST refused
     * the cast. Stripe retrying this is exactly right, so it gets a 500.
     */
    console.error("stripe webhook: confirm_online_payment failed", {
      session: session.id,
      reference: session.clientReferenceId,
      message: error.message,
    });
    return NextResponse.json({ error: "confirm_failed" }, { status: 500 });
  }

  const outcome: string = typeof data === "string" ? data : "unknown";

  // `attention` is money that arrived with no seat to give it. It is logged
  // loudly here AND flagged on the row, because the row is what the admin
  // queue reads and this line is what a person greps when they are already
  // looking at the logs.
  if (outcome === "attention") {
    console.error("stripe webhook: payment needs attention", {
      session: session.id,
      booking: session.clientReferenceId,
    });
  }

  return NextResponse.json({ ok: true, outcome });
}
