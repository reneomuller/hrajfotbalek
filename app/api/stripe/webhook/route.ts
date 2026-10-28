import { NextResponse } from "next/server";
import {
  minorUnitsToCzk,
  parseCheckoutSession,
  verifyStripeSignature,
} from "@/lib/payments/stripeWebhook";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";
import { expireOpenCheckouts } from "@/lib/payments/activeExpiry";
import { parseCheckoutConsent } from "@/lib/payments/checkoutConsent";
import { termsAgreementWording } from "@/lib/legal/consentWording";
import { resolveStrings } from "@/lib/i18n/resolve";
import { sendPurchaseEmails } from "@/lib/payments/purchaseEmails";

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
  /*
   * ONE ENTRY POINT FOR BOTH THINGS THIS PRODUCT SELLS (round 13, item 7).
   *
   * ~~`confirm_online_payment`, which assumed the reference was a booking.~~
   * Since the pass rail moved onto Stripe links, a `client_reference_id` can
   * name a booking OR a pass purchase, and the DISPATCH IS IN SQL: two round
   * trips from here ("is it a booking? no? is it a top-up?") is two chances to
   * act on a stale answer, and neither read would be under the lock the
   * settling function then takes.
   */
  const amountCzk = minorUnitsToCzk(session.amountTotal);

  /*
   * PAY FIRST: A BOOKING SESSION IS SETTLED BY CREATING THE BOOKING
   * (round 26, item 1).
   *
   * `settle_checkout_session` is tried FIRST and answers `unknown` for
   * anything it does not recognise, so the order costs nothing: a session this
   * product opened is a game checkout with no booking behind it yet, and
   * everything else — pass purchases, and any legacy Payment Link still in
   * flight — falls through to `confirm_online_purchase` exactly as before.
   *
   * TWO CALLS, NOT A DISPATCH IN SQL, because they are two different shapes:
   * one is keyed by the STRIPE session id (there is no reference of ours to
   * carry yet) and the other by our own `client_reference_id`.
   */
  const settled = await supabase.rpc("settle_checkout_session", {
    p_stripe_session_id: session.id,
    p_amount_czk: amountCzk,
  });

  if (!settled.error && typeof settled.data === "string" && settled.data !== "unknown") {
    /*
     * A SEAT WAS TAKEN, SO EVERY OTHER FORM FOR THIS GAME MAY NOW BE DEAD.
     * Expiring them is what stops the next payer's money moving at all — the
     * credit path this one may just have taken is the fallback, not the plan.
     */
    if (settled.data === "booked") {
      const { data: row } = await supabase
        .from("checkout_sessions")
        .select("game_id")
        .eq("stripe_session_id", session.id)
        .maybeSingle();
      const gameId = (row as { game_id: string } | null)?.game_id;
      if (gameId) await expireOpenCheckouts(gameId);
    }

    if (settled.data === "credited") {
      // Money arrived for a seat that no longer existed. It became credit and
      // the player was told; this line is what a person greps for.
      console.error("stripe webhook: game full at payment, credited in full", {
        session: session.id,
        amountCzk,
      });
    }

    await recordTermsAcceptance(supabase, payload, settled.data);
    await sendPurchaseEmails(supabase, {
      payload,
      outcome: settled.data,
      sessionId: session.id,
      reference: session.clientReferenceId,
      amountCzk,
    });
    return NextResponse.json({ ok: true, outcome: settled.data });
  }

  const { data, error } = await supabase.rpc("confirm_online_purchase", {
    p_reference: session.clientReferenceId,
    p_session_id: session.id,
    p_amount_czk: amountCzk,
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

  await recordTermsAcceptance(supabase, payload, outcome);
  await sendPurchaseEmails(supabase, {
    payload,
    outcome,
    sessionId: session.id,
    reference: session.clientReferenceId,
    amountCzk,
  });
  return NextResponse.json({ ok: true, outcome });
}

/*
 * THE BOX ABOVE PAY, RECORDED ONCE THE PURCHASE IS REAL (round 40, Texty
 * 2.4). ~~The withdrawal waiver~~ — since 2026-10-28 the terms sentence, the
 * booking box's own, recorded under the same kind (`terms_at_booking`); a
 * `withdrawal_waiver` row now only ever describes a purchase made before it. Only on the outcomes that mean Credits were bought just now — a seat
 * booked, money credited, a pass confirmed. `already` is Stripe retrying an
 * event this endpoint has settled, and recording again would claim a second
 * tick. Never fatal: the money has been handled by the time this runs.
 */
const PURCHASE_OUTCOMES = new Set(["booked", "credited", "confirmed"]);

async function recordTermsAcceptance(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  payload: string,
  outcome: string,
): Promise<void> {
  if (!PURCHASE_OUTCOMES.has(outcome)) return;
  const consent = parseCheckoutConsent(payload);
  if (!consent) return;

  const { error } = await supabase.rpc("record_consent_for", {
    p_player_id: consent.playerId,
    p_kind: "terms_at_booking",
    p_wording: termsAgreementWording(resolveStrings(consent.locale)),
    p_locale: consent.locale,
    p_terms_version: consent.termsVersion,
    p_context: { stripe_session_id: consent.sessionId, via: consent.via, outcome },
    p_accepted_at: consent.acceptedAt,
  });
  if (error) {
    console.error("stripe webhook: could not record the terms box", {
      session: consent.sessionId,
      message: error.message,
    });
  }
}
