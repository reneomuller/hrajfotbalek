import Stripe from "stripe";

/**
 * Embedded Checkout (round 25, item 2) — the server half.
 *
 * WHAT IT REPLACES. Payment LINKS: a fixed URL per product, opened on
 * stripe.com, with the amount decided by the link rather than by us. Two
 * consequences the owner has lived with:
 *
 *   1. THE QUANTITY INSTRUCTION. A party of three had to be told "set the
 *      quantity to 3 on the payment page", because the link had one price and
 *      no way to know how many seats were being bought. The player could type
 *      1 and get three seats for the price of one. That sentence is deleted
 *      by this file: the amount is computed here, server-side, from the
 *      booking that already exists.
 *   2. LEAVING THE SITE. Everything after the tap was Stripe's page, in
 *      Stripe's colours, and the player came back through a redirect that
 *      carried nothing.
 *
 * THE WEBHOOK IS UNCHANGED AND REMAINS THE SOLE SETTLER. An embedded session
 * emits exactly the same `checkout.session.completed` with the same
 * `client_reference_id` and `amount_total`, so `/api/stripe/webhook` did not
 * have to learn anything. **The embedded form reporting success is never
 * treated as confirmation**: the return page polls the database, and the
 * database only moves when the webhook says so. That separation is the whole
 * reason a browser can be closed mid-payment without losing money.
 *
 * GATED ON TWO KEYS. `STRIPE_SECRET_KEY` here and
 * `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in the browser; until BOTH are set,
 * `embeddedCheckoutEnabled()` is false and every caller keeps using the link
 * flow exactly as today. There is never a dead payment path — that rule
 * predates this file (round 12: "Confirm is never live with a dead path behind
 * it") and this is the third feature to honour it.
 */

/** Both halves, because one without the other is a broken checkout. */
export function embeddedCheckoutEnabled(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY?.trim() &&
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim(),
  );
}

/**
 * The SDK client, or null.
 *
 * NOT A MODULE-LEVEL CONSTANT. Constructing `new Stripe()` at import time
 * would throw on any environment without the key — which is every environment
 * until the owner sets it, including the build — and a missing payment
 * configuration must degrade, never crash.
 */
export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return new Stripe(key, {
    // Pinned, so a Stripe-side default bump cannot change the shape of a
    // session under a deployed build.
    apiVersion: "2026-08-26.dahlia",
    typescript: true,
  });
}

/**
 * The `ui_mode` this product creates sessions with.
 *
 * EXPORTED SO A TEST CAN READ IT. `lib/payments/__tests__/uiMode.test.ts`
 * checks this literal against the union the INSTALLED SDK declares — which is
 * the check that was missing when `embedded` reached production and 500'd
 * every checkout. The SDK's union ends in `OtherString`, so the compiler
 * cannot do it; a test reading the `.d.ts` can.
 */
export const CHECKOUT_UI_MODE = "embedded_page";

/** CZK has a hundred haléřů and Stripe counts in the minor unit. */
export function czkToMinorUnits(amountCzk: number): number {
  return Math.round(amountCzk * 100);
}

export interface CheckoutLine {
  /** What the buyer sees on the Stripe form. */
  name: string;
  description?: string;
  /** The WHOLE amount, already multiplied out. Never a unit price × quantity. */
  amountCzk: number;
}

export interface EmbeddedSessionInput {
  line: CheckoutLine;
  /** The booking id or the top-up id — what the webhook dispatches on. */
  reference: string;
  kind: "booking" | "pass";
  customerEmail: string | null;
  /** Absolute, and it must be: Stripe redirects the top-level browser here. */
  returnUrl: string;
}

/**
 * One Checkout Session, embedded.
 *
 * QUANTITY IS ALWAYS 1 AND THE AMOUNT IS THE WHOLE PRICE. A party of three is
 * one line of 450 CZK, not three lines of 150 — because a quantity is a field
 * Stripe lets the buyer edit on some surfaces, and the price of a booking is
 * not a thing the buyer gets to choose. This is the deletion of the
 * set-the-quantity-yourself instruction, expressed as a constraint rather than
 * as copy.
 *
 * `price_data` RATHER THAN A CATALOG PRICE, for the same reason: a catalog
 * price is a fixed number in Stripe's dashboard, and the amount owed here
 * depends on the party size and on how much wallet credit was applied. It is
 * computed from the row and sent per session.
 *
 * METADATA CARRIES WHAT THE DASHBOARD NEEDS TO BE LEGIBLE, and
 * `client_reference_id` carries what the webhook dispatches on — the same
 * field the link flow used, so nothing downstream changes.
 */
export async function createEmbeddedSession(
  input: EmbeddedSessionInput,
): Promise<{ clientSecret: string; sessionId: string } | null> {
  const stripe = stripeClient();
  if (!stripe) return null;

  const session = await stripe.checkout.sessions.create({
    /*
     * `embedded_page`, NOT `embedded` — AND THE TYPE SYSTEM COULD NOT CATCH IT.
     *
     * API version 2026-08-26 renamed the value (`embedded` -> `embedded_page`,
     * and `hosted` -> `hosted_page` with it). The pinned version in
     * `stripeClient()` IS that version, so the first real session creation on
     * production answered `StripeInvalidRequestError` on `param: ui_mode`
     * (`req_TfPOXMxZR56DAE`) and the checkout page 500'd.
     *
     * IT COMPILED BECAUSE THE UNION HAS AN ESCAPE HATCH. The SDK types this as
     * `'elements' | 'embedded_page' | 'form' | 'hosted_page' | OtherString` —
     * that last member widens the union to `string`, so `tsc` accepted a value
     * Stripe rejects. A closed union would have failed the build; this one
     * cannot, which is why the local check that matters here is the SDK's own
     * `.d.ts` rather than the compiler.
     *
     * THE CLIENT HALF IS UNCHANGED, checked against the installed packages
     * rather than assumed: `@stripe/react-stripe-js@6`'s
     * `EmbeddedCheckoutProvider` still takes `options.clientSecret`, and
     * `@stripe/stripe-js@9`'s embedded-checkout options still accept it. The
     * SDK's own doc comment says the same — "For `ui_mode: embedded_page`, the
     * client secret is to be used when initializing Stripe.js embedded
     * checkout". Nothing speculative was changed alongside the rename.
     */
    ui_mode: CHECKOUT_UI_MODE,
    mode: "payment",
    client_reference_id: input.reference,
    customer_email: input.customerEmail ?? undefined,
    metadata: {
      kind: input.kind,
      reference: input.reference,
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "czk",
          unit_amount: czkToMinorUnits(input.line.amountCzk),
          product_data: {
            name: input.line.name,
            ...(input.line.description ? { description: input.line.description } : {}),
          },
        },
      },
    ],
    /*
     * THE RETURN IS OURS. `{CHECKOUT_SESSION_ID}` is Stripe's own placeholder
     * and it substitutes it on the redirect, which is what lets
     * `/payment/return` tell one completion from another without trusting
     * anything the browser could have edited.
     */
    return_url: input.returnUrl,
  });

  if (!session.client_secret) return null;
  return { clientSecret: session.client_secret, sessionId: session.id };
}
