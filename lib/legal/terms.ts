/**
 * The terms checkbox at the point of purchase (round 38).
 *
 * A CREDIT booking carries a required "I accept the terms" box — it is the
 * one purchase that completes on our page. Card payments accept the terms
 * inside Stripe's form instead (`lib/payments/termsConsent.ts`). The box is
 * the courtesy; THIS is the rule — the booking action refuses a credit
 * submission without it, because a form control is not a check anyone using
 * curl has to pass.
 *
 * ONLY THE CHECKBOX'S OWN VALUE COUNTS. A native checkbox posts "on" when
 * ticked and nothing when not, so any other value is a hand-made request and
 * is not consent.
 */
export const TERMS_FIELD = "tos";

const CHECKBOX_ON = "on";

export function acceptedTerms(formData: FormData): boolean {
  return formData.get(TERMS_FIELD) === CHECKBOX_ON;
}
