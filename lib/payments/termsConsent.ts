/**
 * THE TERMS BOX, INSIDE STRIPE'S FORM (round 38).
 *
 * `consent_collection.terms_of_service: "required"` makes embedded Checkout
 * draw a required "I agree to the Terms of Service" box directly above its
 * Pay button, in the buyer's language, and record the answer on the session
 * (`session.consent.terms_of_service`). That is the owner's placement and it
 * is also the strongest one: Pay cannot be pressed without it, which no box
 * on our own page can promise about a form inside an iframe.
 *
 * IT DEPENDS ON ONE DASHBOARD SETTING. Stripe refuses to create such a session
 * unless a Terms of Service URL is set under Settings → Business → Public
 * details, and that setting is not readable through the API — so it cannot be
 * checked ahead of time, only met. `createEmbeddedSession` therefore retries
 * WITHOUT the consent when Stripe refuses for exactly this reason, and the
 * checkout page puts our own box in front of the form instead. A missing
 * dashboard URL must never become a checkout that 500s — round 27 already
 * paid for that lesson once.
 */
export const CHECKOUT_TERMS_CONSENT = { terms_of_service: "required" } as const;

const INVALID_REQUEST = "StripeInvalidRequestError";
const CONSENT_PARAM = "consent_collection";
const TERMS_WORDS = /terms of service/i;

/**
 * True only for Stripe refusing consent collection because the Dashboard has
 * no terms URL. Anything else — a bad `ui_mode`, a network fault, a revoked
 * key — must still surface as the failure it is.
 */
export function isTermsUrlMissing(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { type, param, message } = error as { type?: unknown; param?: unknown; message?: unknown };
  if (type !== INVALID_REQUEST) return false;
  if (typeof param === "string" && param.startsWith(CONSENT_PARAM)) return true;
  return typeof message === "string" && TERMS_WORDS.test(message);
}
