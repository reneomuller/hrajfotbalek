import { describe, expect, it } from "vitest";
import {
  consentBootstrapScript,
  consentModeFor,
  gtmContainerId,
  withSignedUp,
} from "@/lib/analytics/gtm";
import { CONSENT_COOKIE, makeConsent, serializeConsent } from "@/lib/consent";

const NOW = new Date("2026-10-25T09:30:00Z");

/** Runs the inline bootstrap against a fake page and returns what it pushed. */
function runBootstrap(cookie: string): unknown[][] {
  const fakeWindow: { dataLayer?: unknown[] } = {};
  const fakeDocument = { cookie };
  new Function("window", "document", consentBootstrapScript())(fakeWindow, fakeDocument);
  return (fakeWindow.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>));
}

describe("gtmContainerId", () => {
  it("accepts a real container id and nothing else", () => {
    // Arrange
    const values = ["GTM-ABC1234", " GTM-K9X2PQ ", "", undefined, "G-ABC1234", "GTM-", "gtm-abc1234"];

    // Act
    const ids = values.map((value) => gtmContainerId(value));

    // Assert
    expect(ids).toEqual(["GTM-ABC1234", "GTM-K9X2PQ", null, null, null, null, null]);
  });
});

describe("consentModeFor", () => {
  it("denies everything until the reader has answered", () => {
    // Arrange
    const unanswered = null;

    // Act
    const mode = consentModeFor(unanswered);

    // Assert
    expect(mode).toEqual({
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  });

  it("grants analytics alone when only analytics was chosen", () => {
    // Arrange
    const consent = makeConsent({ analytics: true, marketing: false }, NOW);

    // Act
    const mode = consentModeFor(consent);

    // Assert
    expect(mode).toEqual({
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  });

  it("grants the three advertising signals together with marketing", () => {
    // Arrange
    const consent = makeConsent({ analytics: false, marketing: true }, NOW);

    // Act
    const mode = consentModeFor(consent);

    // Assert
    expect(mode).toEqual({
      analytics_storage: "denied",
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
    });
  });
});

describe("consentBootstrapScript", () => {
  it("sets every signal to denied before anything else loads", () => {
    // Arrange
    const noChoice = "NEXT_LOCALE=cs";

    // Act
    const pushed = runBootstrap(noChoice);

    // Assert
    expect(pushed).toEqual([
      [
        "consent",
        "default",
        {
          analytics_storage: "denied",
          ad_storage: "denied",
          ad_user_data: "denied",
          ad_personalization: "denied",
          wait_for_update: 500,
        },
      ],
    ]);
  });

  it("applies a stored choice straight after the default", () => {
    // Arrange
    const consent = makeConsent({ analytics: true, marketing: false }, NOW);
    const jar = `a=1; ${CONSENT_COOKIE}=${serializeConsent(consent)}; b=2`;

    // Act
    const pushed = runBootstrap(jar);

    // Assert
    expect(pushed[1]).toEqual([
      "consent",
      "update",
      {
        analytics_storage: "granted",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      },
    ]);
  });

  it("leaves a garbled or round-28 cookie at the denied default", () => {
    // Arrange
    const jars = [`${CONSENT_COOKIE}=all`, `${CONSENT_COOKIE}=%7Bbroken`, `${CONSENT_COOKIE}=necessary`];

    // Act
    const pushedCounts = jars.map((jar) => runBootstrap(jar).length);

    // Assert
    expect(pushedCounts).toEqual([1, 1, 1]);
  });
});

describe("withSignedUp", () => {
  it("marks the landing page so the browser can report the sign-up once", () => {
    // Arrange
    const paths = ["/games", "/game/abc/book?guests=2", "/account#profile"];

    // Act
    const marked = paths.map((path) => withSignedUp(path));

    // Assert
    expect(marked).toEqual([
      "/games?signed_up=1",
      "/game/abc/book?guests=2&signed_up=1",
      "/account?signed_up=1#profile",
    ]);
  });
});
