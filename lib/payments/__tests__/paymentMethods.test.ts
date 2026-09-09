import { describe, expect, it } from "vitest";
import { CHECKOUT_PAYMENT_METHOD_TYPES } from "@/lib/payments/embeddedCheckout";

/**
 * ROUND 28, ITEM 2 — the method set a session is created with.
 *
 * ASSERTED AS AN EXACT SET, not as "does it contain card". A containment check
 * passes on `['card', 'klarna']`, which is the failure this exists to catch:
 * the risk here is not that card goes missing, it is that something ELSE
 * arrives — from a dashboard toggle, from a Stripe default, or from somebody
 * adding a method to the array without being told not to.
 */

describe("the checkout's payment methods", () => {
  it("is exactly card, and nothing else", () => {
    // Arrange / Act
    const methods = [...CHECKOUT_PAYMENT_METHOD_TYPES];

    // Assert
    expect(methods).toEqual(["card"]);
  });

  it("never offers Link or Klarna", () => {
    /*
     * NAMED, RATHER THAN COVERED BY THE SET ASSERTION ABOVE. The set test says
     * what is allowed; this one says what the owner ruled out, so a future
     * change that widens the list fails on a line that explains why.
     */
    // Arrange
    const forbidden = ["link", "klarna"];

    // Act
    const offered = [...CHECKOUT_PAYMENT_METHOD_TYPES] as string[];

    // Assert
    for (const method of forbidden) {
      expect(offered, `${method} must never appear at checkout`).not.toContain(method);
    }
  });

  it("does not try to name the wallets, which are card presentations", () => {
    /*
     * Apple Pay and Google Pay are surfaced BY the card method, per device.
     * Passing them as method types is not how they are enabled and Stripe
     * rejects them — so their absence here is correct, and this asserts it on
     * purpose rather than by omission.
     */
    // Arrange / Act
    const offered = [...CHECKOUT_PAYMENT_METHOD_TYPES] as string[];

    // Assert
    expect(offered).not.toContain("apple_pay");
    expect(offered).not.toContain("google_pay");
  });
});
