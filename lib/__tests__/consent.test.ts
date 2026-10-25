import { describe, expect, it } from "vitest";
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  consentAllows,
  consentCookieValue,
  makeConsent,
  parseConsent,
  readConsentFrom,
  serializeConsent,
} from "@/lib/consent";

/**
 * The consent decision (round 28, reworked for analytics in round 40).
 *
 * The banner is UI and the copy is the lawyer's, but the RULE is a pure
 * function and it is the half that must not be got wrong: an unanswered banner
 * is not consent, a garbled cookie is not consent, and a "yes" given to a banner
 * that never mentioned analytics is not consent either.
 */

const NOW = new Date("2026-10-25T09:30:00Z");

describe("makeConsent", () => {
  it("stamps the choice with its date and the cookie-policy version", () => {
    // Arrange
    const categories = { analytics: true, marketing: false };

    // Act
    const consent = makeConsent(categories, NOW);

    // Assert
    expect(consent).toEqual({
      analytics: true,
      marketing: false,
      date: "2026-10-25",
      version: "2.0",
    });
  });
});

describe("parseConsent", () => {
  it("reads back exactly what was stored", () => {
    // Arrange
    const stored = makeConsent({ analytics: false, marketing: true }, NOW);

    // Act
    const parsed = parseConsent(serializeConsent(stored));

    // Assert
    expect(parsed).toEqual(stored);
  });

  it("keeps an old refusal as a refusal of both new categories", () => {
    // Arrange
    const legacy = "necessary";

    // Act
    const parsed = parseConsent(legacy);

    // Assert
    expect(parsed).toMatchObject({ analytics: false, marketing: false });
  });

  it("asks again where the old banner was accepted — that banner never mentioned analytics", () => {
    // Arrange: the round-28 banner said "we use only what the site needs and
    // will ask before anything else", so its "Accept all" consented to nothing
    // we now do.
    const legacy = "all";

    // Act
    const parsed = parseConsent(legacy);

    // Assert
    expect(parsed).toBeNull();
  });

  it("treats an absent, empty or garbled value as unanswered", () => {
    // Arrange
    const junk = [null, undefined, "", "   ", "yes", "%7Bnot-json", '{"analytics":"yes"}'];

    // Act
    const parsed = junk.map((value) => parseConsent(value));

    // Assert
    expect(parsed).toEqual(junk.map(() => null));
  });
});

describe("consentAllows", () => {
  it("never blocks a necessary cookie, whatever the answer", () => {
    // Arrange
    const answers = [null, makeConsent({ analytics: false, marketing: false }, NOW)];

    // Act
    const allowed = answers.map((answer) => consentAllows("necessary", answer));

    // Assert
    expect(allowed).toEqual([true, true]);
  });

  it("refuses analytics and marketing on an unanswered banner", () => {
    // Arrange
    const unanswered = null;

    // Act
    const allowed = [consentAllows("analytics", unanswered), consentAllows("marketing", unanswered)];

    // Assert
    expect(allowed).toEqual([false, false]);
  });

  it("answers each category on its own", () => {
    // Arrange
    const onlyAnalytics = makeConsent({ analytics: true, marketing: false }, NOW);

    // Act
    const allowed = [consentAllows("analytics", onlyAnalytics), consentAllows("marketing", onlyAnalytics)];

    // Assert
    expect(allowed).toEqual([true, false]);
  });
});

describe("readConsentFrom", () => {
  it("finds the choice among other cookies", () => {
    // Arrange
    const consent = makeConsent({ analytics: true, marketing: true }, NOW);
    const jar = `sb-access-token=abc; ${CONSENT_COOKIE}=${serializeConsent(consent)}; NEXT_LOCALE=cs`;

    // Act
    const found = readConsentFrom(jar);

    // Assert
    expect(found).toEqual(consent);
  });

  it("is unanswered when the cookie is absent", () => {
    // Arrange
    const jar = "sb-access-token=abc; NEXT_LOCALE=cs";

    // Act
    const found = readConsentFrom(jar);

    // Assert
    expect(found).toBeNull();
  });

  it("does not match a cookie whose name merely ends with ours", () => {
    // Arrange
    const jar = `x-${CONSENT_COOKIE}=necessary`;

    // Act
    const found = readConsentFrom(jar);

    // Assert
    expect(found).toBeNull();
  });
});

describe("consentCookieValue", () => {
  it("remembers the choice for twelve months (Texty pro web 9.3)", () => {
    // Arrange
    const consent = makeConsent({ analytics: false, marketing: false }, NOW);

    // Act
    const cookie = consentCookieValue(consent);

    // Assert
    expect(CONSENT_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 365);
    expect(cookie).toContain(`max-age=${CONSENT_MAX_AGE_SECONDS}`);
    expect(cookie.startsWith(`${CONSENT_COOKIE}=`)).toBe(true);
  });
});
