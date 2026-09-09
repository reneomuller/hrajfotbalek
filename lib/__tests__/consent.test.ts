import { describe, expect, it } from "vitest";
import {
  CONSENT_COOKIE,
  consentAllows,
  parseConsent,
  readConsentFrom,
} from "@/lib/consent";

/**
 * ROUND 28, ITEM 1 — the consent decision.
 *
 * The banner is UI and the copy is a compliance question, but the RULE is a
 * pure function and it is the half that must not be got wrong: an unanswered
 * banner is not consent, and a garbled cookie is not consent either.
 */

describe("parseConsent", () => {
  it("reads the two real answers", () => {
    expect(parseConsent("all")).toBe("all");
    expect(parseConsent("necessary")).toBe("necessary");
  });

  it("treats an absent, empty or unknown value as unanswered", () => {
    // Arrange
    const junk = [null, undefined, "", "   ", "yes", "true", "1", "ALL-OF-IT"];

    // Act / Assert
    for (const value of junk) {
      expect(parseConsent(value), `${String(value)} should not count as an answer`).toBeNull();
    }
  });

  it("is case- and whitespace-insensitive on a real answer", () => {
    expect(parseConsent(" All ")).toBe("all");
    expect(parseConsent("NECESSARY")).toBe("necessary");
  });
});

describe("consentAllows", () => {
  it("never blocks a necessary cookie, whatever the answer", () => {
    // Necessary means necessary: the site cannot sign anybody in without it,
    // and a caller that has to special-case it will get the special case wrong.
    expect(consentAllows("necessary", null)).toBe(true);
    expect(consentAllows("necessary", "necessary")).toBe(true);
    expect(consentAllows("necessary", "all")).toBe(true);
  });

  it("allows analytics ONLY after accept-all", () => {
    expect(consentAllows("analytics", "all")).toBe(true);
  });

  it("refuses analytics on an unanswered banner", () => {
    /*
     * THE ONE THAT MATTERS. Defaulting the other way makes the banner
     * decorative, which is the failure that gets products fined — and it is an
     * easy default to reach for, because "we have not been told no" reads like
     * permission.
     */
    expect(consentAllows("analytics", null)).toBe(false);
  });

  it("refuses analytics after only-necessary", () => {
    expect(consentAllows("analytics", "necessary")).toBe(false);
  });
});

describe("readConsentFrom", () => {
  it("finds the choice among other cookies", () => {
    // Arrange
    const jar = `sb-access-token=abc; ${CONSENT_COOKIE}=all; NEXT_LOCALE=cs`;

    // Act / Assert
    expect(readConsentFrom(jar)).toBe("all");
  });

  it("is unanswered when the cookie is absent", () => {
    expect(readConsentFrom("sb-access-token=abc; NEXT_LOCALE=cs")).toBeNull();
  });

  it("does not match a cookie whose name merely ends with ours", () => {
    // `x-hf-consent` is a different cookie and must not answer for this one.
    expect(readConsentFrom(`x-${CONSENT_COOKIE}=all`)).toBeNull();
  });

  it("is unanswered on an empty jar", () => {
    expect(readConsentFrom("")).toBeNull();
  });
});
