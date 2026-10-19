import Stripe from "stripe";
import type { Locale } from "@/lib/i18n/locales";
import { CHECKOUT_TERMS_CONSENT, isTermsUrlMissing } from "@/lib/payments/termsConsent";

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

/**
 * THE ONLY PAYMENT METHODS THIS PRODUCT OFFERS (round 28, item 2).
 *
 * `card` AND NOTHING ELSE — which is not the same as "one button". Apple Pay
 * and Google Pay are surfaced by Stripe as wallet presentations OF the card
 * method, so pinning to `card` still gives a phone its native wallet sheet
 * automatically, per device, with no extra entry here. Adding `apple_pay` or
 * `google_pay` to this array is not how they are enabled and Stripe rejects
 * them as method types.
 *
 * WHAT THIS EXCLUDES, DELIBERATELY AND BY NAME: `link` and `klarna`.
 *
 *   LINK is Stripe's own saved-card wallet. It prompts for an email, remembers
 *   the card against a Stripe-side identity, and puts a second account
 *   relationship between this product and its player — for a 150 CZK football
 *   booking that is a checkout step that buys nobody anything.
 *
 *   KLARNA is pay-later credit. Financing a pickup football game is not a
 *   thing this product will offer, and a "3 interest-free payments" option on
 *   a 150 CZK line is the kind of thing that reads as a mistake because it is
 *   one.
 *
 * PINNING HERE IS NECESSARY AND NOT SUFFICIENT. Passing `payment_method_types`
 * makes Stripe use exactly this list for the sessions WE create, which is the
 * half that lives in code. The account-level toggles still govern what the
 * dashboard offers elsewhere, and Link in particular has its own switch — see
 * `docs/REQUESTS.md` §6 for the owner's exact steps. Both halves, or a future
 * session created somewhere else re-inherits the defaults.
 */
export const CHECKOUT_PAYMENT_METHOD_TYPES = ["card"] as const;

/**
 * LINK IS OFF AS A WALLET, NOT ONLY AS A METHOD (round 36, item 1).
 *
 * THE GAP THIS CLOSES. The comment above has said since round 28 that Link is
 * excluded — and `payment_method_types: ["card"]` excludes it as a payment
 * METHOD, which is the half that was done. It does not stop Checkout
 * presenting Link as a WALLET in the express row at the top of the form, and
 * the SDK says so in as many words: "By default, Checkout will display all the
 * supported wallets that the Checkout Session was created with."
 *
 * So the code now matches what its own comment claimed. `never` is the only
 * other value the SDK declares for this field.
 *
 * IT IS ALSO THE WHOLE OF WHAT ITEM 1 CAN CONTROL, which is the finding rather
 * than the fix — see the note on `wallet_options` in `createEmbeddedSession`.
 */
export const CHECKOUT_LINK_DISPLAY = "never" as const;

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
  /**
   * For a PASS, the top-up id the webhook dispatches on. For a GAME under
   * pay-first there is no row of ours yet, so this is the game id — carried
   * for the Stripe dashboard's legibility rather than for dispatch, which
   * happens on the session id itself.
   */
  reference: string;
  kind: "booking" | "pass";
  customerEmail: string | null;
  /** Absolute, and it must be: Stripe redirects the top-level browser here. */
  returnUrl: string;
  /**
   * PAY FIRST (round 26, item 1) — what the webhook needs to CREATE a booking,
   * because none exists yet. Present only for a game checkout.
   */
  gameId?: string;
  playerId?: string;
  guestCount?: number;
  /**
   * THE LAWYER'S TWO TEXTS, INSIDE STRIPE'S FORM (round 40). Every card
   * payment buys Credits (Obchodní podmínky 5.1), so every session carries
   * the Credit summary directly above Pay (Texty 3.2) and the withdrawal
   * waiver as the box Stripe draws above it (Texty 3.3) — Pay stays disabled
   * until it is ticked, which no box on our own page can promise about a form
   * inside an iframe.
   */
  legal: {
    /** Markdown: Stripe renders the terms link. ≤ 1200 characters. */
    summary: string;
    waiver: string;
    /** Our locale; Stripe has no Ukrainian, so that one falls back to the browser. */
    locale: Locale;
    termsVersion: string;
  };
}

/** Stripe Checkout's own label languages, for the four this product speaks. */
const STRIPE_LOCALE: Record<Locale, Stripe.Checkout.SessionCreateParams.Locale> = {
  en: "en",
  cs: "cs",
  ru: "ru",
  uk: "auto",
};

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
): Promise<{ clientSecret: string; sessionId: string; termsInStripe: boolean } | null> {
  const stripe = stripeClient();
  if (!stripe) return null;

  const params: Stripe.Checkout.SessionCreateParams = {
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
    /*
     * EXPLICIT, NOT AUTOMATIC. Omitting this hands the decision to the
     * account's "automatic payment methods" setting, which is a dashboard
     * checkbox that can turn Link or Klarna on for every session this product
     * creates without a deploy. The list is in the code so the answer cannot
     * change underneath us.
     */
    payment_method_types: [...CHECKOUT_PAYMENT_METHOD_TYPES],
    /*
     * THE ONLY WALLET KNOB A CHECKOUT SESSION HAS, and round 36 item 1 is the
     * reason it is worth saying so here.
     *
     * The owner reported Apple Pay rendering TWICE in the embedded form — once
     * at the top, once at the bottom — and asked which layer produces each. It
     * is not this one, and the SDK's own declarations are the evidence:
     * `SessionCreateParams.WalletOptions` contains exactly one member, `link`;
     * there is no `apple_pay`, no `google_pay`, and no express-checkout or
     * layout parameter anywhere in the 5,137-line declaration file. `apple_pay`
     * is not even a valid `PaymentMethodType` — the wallets are presentations
     * OF `card`, which is why they appear without being asked for and cannot be
     * placed, counted or suppressed from here.
     *
     * WHAT THIS DOES ACHIEVE is the one wallet we CAN turn off. Link out of the
     * express row leaves it to the device's own wallet, which is the narrowest
     * that row can be made from a session — the "config that minimizes it" the
     * item asks for, offered without pretending it removes the duplicate.
     */
    wallet_options: { link: { display: CHECKOUT_LINK_DISPLAY } },
    client_reference_id: input.reference,
    customer_email: input.customerEmail ?? undefined,
    /*
     * THE METADATA IS THE BOOKING, WAITING TO HAPPEN. Under pay-first nothing
     * exists in our database when this session is created, so everything the
     * webhook needs to build the booking travels here — and travels back
     * signed, on an event we verify.
     *
     * `settle_checkout_session` reads none of it: it keys off the session id,
     * which is the one identifier Stripe guarantees and nobody can edit. These
     * are for a HUMAN reading the Stripe dashboard, and for the day somebody
     * has to reconcile a payment by hand.
     */
    /*
     * "Pay", AND THE AMOUNT BESIDE IT. Texty 3.5 wants a button that says money
     * moves; Stripe's `pay` renders "Zaplatit" / "Pay" with the total.
     */
    submit_type: "pay",
    locale: STRIPE_LOCALE[input.legal.locale],
    custom_text: { submit: { message: input.legal.summary } },
    metadata: {
      kind: input.kind,
      reference: input.reference,
      // What the webhook needs to RECORD the waiver (Texty 2.4, round 40).
      consent_locale: input.legal.locale,
      terms_version: input.legal.termsVersion,
      ...(input.gameId ? { game_id: input.gameId } : {}),
      ...(input.playerId ? { player_id: input.playerId } : {}),
      ...(input.guestCount !== undefined
        ? { guest_count: String(input.guestCount) }
        : {}),
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
  };

  /*
   * THE TERMS BOX ABOVE PAY, OR OURS IN FRONT OF THE FORM (round 38) — see
   * `lib/payments/termsConsent.ts`. Only the one refusal that means "no terms
   * URL in the Dashboard" falls back; every other error still throws.
   */
  let termsInStripe = true;
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      ...params,
      consent_collection: CHECKOUT_TERMS_CONSENT,
      custom_text: {
        ...params.custom_text,
        terms_of_service_acceptance: { message: input.legal.waiver },
      },
      metadata: { ...params.metadata, consent_via: "stripe" },
    });
  } catch (error) {
    if (!isTermsUrlMissing(error)) throw error;
    console.error(
      "checkout: Stripe has no Terms of Service URL — set it under Settings → Business → Public details; falling back to our own terms box",
    );
    termsInStripe = false;
    // Our own box stands in front of the form instead (CheckoutTermsGate).
    session = await stripe.checkout.sessions.create({
      ...params,
      metadata: { ...params.metadata, consent_via: "site" },
    });
  }

  if (!session.client_secret) return null;
  return { clientSecret: session.client_secret, sessionId: session.id, termsInStripe };
}
