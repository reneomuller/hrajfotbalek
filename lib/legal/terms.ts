/**
 * The terms checkbox at the point of purchase (round 38).
 *
 * Booking a game and buying a pass each carry a required "I accept the terms"
 * box. The box is the courtesy; THIS is the rule — both server actions refuse
 * a submission that does not carry it, because a form control is not a check
 * anyone using curl has to pass.
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
