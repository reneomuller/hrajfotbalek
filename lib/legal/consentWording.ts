import { fillTemplate } from "@/lib/i18n/template";
import type { Strings } from "@/lib/strings";

/**
 * The exact words a consent record stores (round 40, Texty pro web 2.4).
 *
 * Built from the SAME keys the boxes render, with each link replaced by its
 * label — so the record reads as the sentence the player ticked, in the
 * language they ticked it in, rather than as a key somebody has to look up
 * against a version of the copy that may since have changed.
 */

/** The sign-up box: terms, community rules, the risk notice, the photo permission. */
export function signupTermsWording(t: Strings): string {
  return fillTemplate(t.auth.tosAgreement, {
    terms: t.auth.tosTermsLink,
    rules: t.auth.tosRulesLink,
  });
}

/** The box above "Book for 1 Credit" (round 38). */
export function bookingTermsWording(t: Strings): string {
  return fillTemplate(t.booking.termsAgree, { terms: t.auth.tosTermsLink });
}

/** Texty 3.3 — the separate waiver box on every purchase of Credits. */
export function waiverWording(t: Strings): string {
  return t.purchase.waiver;
}
