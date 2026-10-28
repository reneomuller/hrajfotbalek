import { describe, expect, it } from "vitest";
import { parseCheckoutConsent } from "@/lib/payments/checkoutConsent";

const PLAYER = "4ccc0000-0000-0000-0000-000000000001";

function completed(object: Record<string, unknown>, created = 1_792_400_000): string {
  return JSON.stringify({
    type: "checkout.session.completed",
    created,
    data: { object: { id: "cs_test_1", ...object } },
  });
}

const STRIPE_METADATA = {
  player_id: PLAYER,
  consent_locale: "cs",
  terms_version: "2.0",
  consent_via: "stripe",
};

describe("parseCheckoutConsent", () => {
  it("reads the box ticked inside Stripe's form", () => {
    // Arrange
    const payload = completed({
      metadata: STRIPE_METADATA,
      consent: { terms_of_service: "accepted" },
    });

    // Act
    const consent = parseCheckoutConsent(payload);

    // Assert
    expect(consent).toEqual({
      sessionId: "cs_test_1",
      playerId: PLAYER,
      locale: "cs",
      termsVersion: "2.0",
      via: "stripe",
      acceptedAt: new Date(1_792_400_000 * 1000).toISOString(),
    });
  });

  it("records nothing when Stripe drew the box and does not say it was accepted", () => {
    // Arrange
    const payload = completed({ metadata: STRIPE_METADATA, consent: null });

    // Act
    const consent = parseCheckoutConsent(payload);

    // Assert
    expect(consent).toBeNull();
  });

  it("trusts our own box, which the form could not be paid past", () => {
    // Arrange
    const payload = completed({ metadata: { ...STRIPE_METADATA, consent_via: "site" } });

    // Act
    const consent = parseCheckoutConsent(payload);

    // Assert
    expect(consent?.via).toBe("site");
  });

  it("ignores a session created before round 40, which carries no consent metadata", () => {
    // Arrange
    const payload = completed({ metadata: { kind: "booking" }, consent: { terms_of_service: "accepted" } });

    // Act
    const consent = parseCheckoutConsent(payload);

    // Assert
    expect(consent).toBeNull();
  });

  it("refuses a locale this product does not speak rather than storing it", () => {
    // Arrange
    const payload = completed({
      metadata: { ...STRIPE_METADATA, consent_locale: "de" },
      consent: { terms_of_service: "accepted" },
    });

    // Act
    const consent = parseCheckoutConsent(payload);

    // Assert
    expect(consent).toBeNull();
  });
});
