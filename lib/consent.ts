/**
 * Cookie consent — the decision, its storage, and what it currently gates
 * (round 28, item 1).
 *
 * THE HONEST STATEMENT FIRST, because it is the whole reason this file has a
 * long comment and a short body: **today both answers produce exactly the same
 * cookies.** This product sets one kind of cookie — Supabase's auth session,
 * plus the locale and the pending-purchase stash — and every one of them is
 * strictly necessary to do the thing the player asked for. There is no
 * analytics, no pixel, no third-party tag, and nothing here removes one when
 * "Only necessary" is chosen, because there is nothing to remove.
 *
 * SO WHY SHIP IT. Because the gate has to exist BEFORE the first script that
 * needs gating, not after. The failure this prevents is the ordinary one: an
 * analytics snippet gets added in some later round, goes straight into the
 * layout because that is where scripts go, and ships to production having
 * asked nobody. `consentAllows("analytics")` gives that snippet a door it must
 * come through, and this file is where the answer lives.
 *
 * WHAT MUST NOT HAPPEN is a banner that claims more than it does. The copy
 * says what is true — we use what the site needs to work, and ask before
 * anything else — rather than a generic "we value your privacy" paragraph
 * about cookie categories this product does not have.
 *
 * THE CONSENT COOKIE IS ITSELF NECESSARY, which is not circular: a record of a
 * refusal is the only way to avoid asking again, and asking again forever is
 * worse for the reader than storing one word.
 */

export const CONSENT_COOKIE = "hf-consent";

/** How long a choice stands before we ask again. Six months is the usual. */
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 182;

export const CONSENT_CHOICES = ["all", "necessary"] as const;
export type ConsentChoice = (typeof CONSENT_CHOICES)[number];

/**
 * The categories a caller can ask about.
 *
 * `necessary` is deliberately included and deliberately always true: a caller
 * that has to special-case "this one needs no consent" will eventually get the
 * special case wrong. Asking is always allowed; the answer for necessary is
 * simply yes.
 */
export type ConsentCategory = "necessary" | "analytics";

/** The stored choice, or null when the reader has not answered yet. */
export function parseConsent(raw: string | null | undefined): ConsentChoice | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  return (CONSENT_CHOICES as readonly string[]).includes(value)
    ? (value as ConsentChoice)
    : null;
}

/**
 * May this category run?
 *
 * NO CHOICE MEANS NO, for everything but `necessary`. An unanswered banner is
 * not implied consent, and defaulting the other way would make the banner
 * decorative — which is the failure mode that gets products fined.
 */
export function consentAllows(
  category: ConsentCategory,
  choice: ConsentChoice | null,
): boolean {
  if (category === "necessary") return true;
  return choice === "all";
}

/** The `document.cookie` string for a choice. Client-side; there is no secret. */
export function consentCookieValue(choice: ConsentChoice): string {
  return (
    `${CONSENT_COOKIE}=${choice}; path=/; max-age=${CONSENT_MAX_AGE_SECONDS}; samesite=lax` +
    (typeof location !== "undefined" && location.protocol === "https:" ? "; secure" : "")
  );
}

/** Reads the choice out of a raw `document.cookie` string. */
export function readConsentFrom(cookieString: string): ConsentChoice | null {
  for (const part of cookieString.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === CONSENT_COOKIE) return parseConsent(rest.join("="));
  }
  return null;
}
