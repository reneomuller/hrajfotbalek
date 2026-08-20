import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stripe webhook signature verification, without the Stripe SDK.
 *
 * WHY NOT `stripe.webhooks.constructEvent`. The SDK is a large dependency
 * whose only use here would be forty lines of HMAC — this product has five
 * runtime dependencies and adds one when it buys something. What Stripe
 * documents is a stable, versioned scheme (`v1`, HMAC-SHA256), and it is
 * implemented below exactly as documented rather than approximately.
 *
 * THE SIGNATURE IS THE ONLY THING STANDING BETWEEN THIS ENDPOINT AND ANYONE
 * ON THE INTERNET. `/api/stripe/webhook` is public by necessity, it confirms
 * bookings, and its payload names the booking to confirm — so an unverified
 * POST would let a stranger seat themselves for nothing. Three properties
 * matter and all three are asserted in `__tests__`:
 *
 *   1. The MAC is computed over `${timestamp}.${rawBody}` — the RAW body, byte
 *      for byte. Re-serialising the parsed JSON changes key order and
 *      whitespace and breaks the signature, which is why the route reads
 *      `await request.text()` and never `request.json()`.
 *   2. The comparison is TIMING-SAFE. A byte-by-byte `===` leaks how much of a
 *      forged signature was right, which is enough to construct one.
 *   3. The timestamp is checked against a tolerance, so a signature captured
 *      once cannot be replayed a week later.
 */

/** Stripe's own default. Five minutes either side of our clock. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "no_signature" | "malformed" | "stale" | "mismatch" };

/**
 * @param payload the raw request body, exactly as received
 * @param header  the `Stripe-Signature` header
 * @param secret  `STRIPE_WEBHOOK_SECRET` — the signing secret, `whsec_…`
 * @param nowMs   injectable so the tolerance can be tested without waiting
 */
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  nowMs: number = Date.now(),
): VerifyResult {
  if (!header) return { ok: false, reason: "no_signature" };

  // `t=1492774577,v1=5257a869e7…,v1=…` — more than one `v1` appears while a
  // secret is being rotated, and ANY of them matching is a valid signature.
  let timestamp: string | null = null;
  const signatures: string[] = [];

  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key?.trim() === "t") timestamp = value?.trim() ?? null;
    if (key?.trim() === "v1" && value) signatures.push(value.trim());
  }

  if (!timestamp || signatures.length === 0) return { ok: false, reason: "malformed" };

  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return { ok: false, reason: "malformed" };

  // ABSOLUTE difference: a clock that is behind is as much of a problem as one
  // that is ahead, and a far-future timestamp is a replay attempt with a
  // deliberately skewed `t`.
  if (Math.abs(nowMs / 1000 - sent) > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: "stale" };
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "utf8");

  for (const candidate of signatures) {
    const candidateBuffer = Buffer.from(candidate, "utf8");
    // `timingSafeEqual` THROWS on a length mismatch rather than returning
    // false, and a forged signature of the wrong length is the ordinary case.
    if (candidateBuffer.length !== expectedBuffer.length) continue;
    if (timingSafeEqual(candidateBuffer, expectedBuffer)) return { ok: true };
  }

  return { ok: false, reason: "mismatch" };
}

export interface CheckoutSession {
  id: string;
  clientReferenceId: string | null;
  /** Minor units, as Stripe sends them. Haléře for CZK. */
  amountTotal: number | null;
  currency: string | null;
}

/**
 * Pulls the four fields the handler needs out of a `checkout.session.completed`
 * event, and returns null for anything else.
 *
 * TOTALLY UNTRUSTING. The body arrives from the network; the signature proves
 * it came from Stripe and nothing more. Every field is checked for the type it
 * has to have, because a missing `amount_total` read as `0` would flag a paid
 * booking as underpaid, and a missing one read as "skip the check" would seat
 * an unpaid one.
 */
export function parseCheckoutSession(payload: string): CheckoutSession | null {
  let event: unknown;
  try {
    event = JSON.parse(payload);
  } catch {
    return null;
  }

  if (typeof event !== "object" || event === null) return null;
  const record = event as Record<string, unknown>;
  if (record.type !== "checkout.session.completed") return null;

  const data = record.data as Record<string, unknown> | undefined;
  const object = data?.object as Record<string, unknown> | undefined;
  if (!object || typeof object.id !== "string") return null;

  return {
    id: object.id,
    clientReferenceId:
      typeof object.client_reference_id === "string" ? object.client_reference_id : null,
    amountTotal: typeof object.amount_total === "number" ? object.amount_total : null,
    currency: typeof object.currency === "string" ? object.currency : null,
  };
}

/**
 * Minor units to CZK.
 *
 * CZK HAS A HUNDRED HALÉŘŮ and Stripe sends the minor unit, so 150 CZK arrives
 * as 15000. Rounding DOWN is deliberate: a fraction of a koruna that rounded up
 * would let a payment one haléř short read as exact, and the underpayment
 * check is the thing standing between an unpaid party and a seated one.
 */
export function minorUnitsToCzk(amountTotal: number): number {
  return Math.floor(amountTotal / 100);
}
