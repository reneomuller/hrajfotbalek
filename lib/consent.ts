import { COOKIES_VERSION } from "@/lib/legal";

/**
 * Cookie consent — the decision, its storage, and what it gates (round 28,
 * reworked in round 40 for analytics).
 *
 * ROUND 28 BUILT THE GATE BEFORE THERE WAS ANYTHING TO GATE, so that the first
 * analytics script would have a door it must come through. Round 40 is that
 * script: Google Tag Manager carries GA4 and the Meta Pixel, and the lawyer's
 * brief (Texty pro web 9.2–9.3) says what the door looks like — two optional
 * categories, both off until switched on, the choice stored with its date and
 * version and remembered for twelve months.
 *
 * NOTHING HERE RUNS WHILE `NEXT_PUBLIC_GTM_ID` IS UNSET. Without a tag there is
 * nothing to consent to, and Texty 9.1 says no banner shows while only
 * necessary cookies are used — see `lib/analytics/gtm.ts`.
 *
 * THE CONSENT COOKIE IS ITSELF NECESSARY, which is not circular: a record of a
 * refusal is the only way to avoid asking again, and asking again forever is
 * worse for the reader than storing one value.
 */

export const CONSENT_COOKIE = "hf-consent";

/** Texty pro web 9.3: "pamatovat si ji 12 měsíců". */
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * The categories a caller can ask about.
 *
 * `necessary` is deliberately included and deliberately always true: a caller
 * that has to special-case "this one needs no consent" will eventually get the
 * special case wrong. Asking is always allowed; the answer for necessary is yes.
 */
export type ConsentCategory = "necessary" | "analytics" | "marketing";

/** What a reader chose, when, and against which version of the cookie policy. */
export interface Consent {
  analytics: boolean;
  marketing: boolean;
  /** YYYY-MM-DD, the day the choice was made. */
  date: string;
  /** `COOKIES_VERSION` at the time — the policy the choice was made against. */
  version: string;
}

export function makeConsent(
  categories: { analytics: boolean; marketing: boolean },
  now: Date = new Date(),
): Consent {
  return {
    analytics: categories.analytics,
    marketing: categories.marketing,
    date: now.toISOString().slice(0, 10),
    version: COOKIES_VERSION,
  };
}

/** URL-encoded JSON: a cookie value may not carry `;`, `,` or spaces. */
export function serializeConsent(consent: Consent): string {
  return encodeURIComponent(JSON.stringify(consent));
}

/**
 * The stored choice, or null when the reader has to be asked.
 *
 * THE TWO ROUND-28 VALUES ARE READ DIFFERENTLY, ON PURPOSE. That banner said
 * "we use only what the site needs to work, and will ask before anything
 * else". A refusal given to it is still a refusal, so `necessary` carries over
 * as both categories off. An `all` given to it consented to nothing this site
 * now does — it never mentioned analytics or advertising — so it is treated as
 * unanswered and the reader is asked, which is what that banner promised.
 */
export function parseConsent(raw: string | null | undefined): Consent | null {
  if (!raw) return null;
  const value = raw.trim();
  if (value === "") return null;

  if (value.toLowerCase() === "necessary") {
    return { analytics: false, marketing: false, date: "", version: "legacy" };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(decodeURIComponent(value));
  } catch {
    return null;
  }
  if (typeof decoded !== "object" || decoded === null) return null;

  const record = decoded as Record<string, unknown>;
  if (typeof record.analytics !== "boolean" || typeof record.marketing !== "boolean") return null;
  return {
    analytics: record.analytics,
    marketing: record.marketing,
    date: typeof record.date === "string" ? record.date : "",
    version: typeof record.version === "string" ? record.version : "",
  };
}

/**
 * May this category run?
 *
 * NO CHOICE MEANS NO, for everything but `necessary`. An unanswered banner is
 * not implied consent, and defaulting the other way would make the banner
 * decorative — which is the failure mode that gets products fined.
 */
export function consentAllows(category: ConsentCategory, consent: Consent | null): boolean {
  if (category === "necessary") return true;
  if (!consent) return false;
  return category === "analytics" ? consent.analytics : consent.marketing;
}

/** The `document.cookie` string for a choice. Client-side; there is no secret. */
export function consentCookieValue(consent: Consent): string {
  return (
    `${CONSENT_COOKIE}=${serializeConsent(consent)}; path=/; max-age=${CONSENT_MAX_AGE_SECONDS}; samesite=lax` +
    (typeof location !== "undefined" && location.protocol === "https:" ? "; secure" : "")
  );
}

/** Reads the choice out of a raw `document.cookie` string. */
export function readConsentFrom(cookieString: string): Consent | null {
  for (const part of cookieString.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === CONSENT_COOKIE) return parseConsent(rest.join("="));
  }
  return null;
}
