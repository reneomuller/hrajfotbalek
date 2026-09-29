import { describe, expect, it } from "vitest";
import { CHECKOUT_TERMS_CONSENT, isTermsUrlMissing } from "@/lib/payments/termsConsent";

describe("CHECKOUT_TERMS_CONSENT", () => {
  it("asks Stripe to require the terms box above Pay", () => {
    // Arrange / Act / Assert
    expect(CHECKOUT_TERMS_CONSENT).toEqual({ terms_of_service: "required" });
  });
});

describe("isTermsUrlMissing", () => {
  it("recognises Stripe refusing consent because no terms URL is set", () => {
    // Arrange — the shape Stripe answers with when the Dashboard has no
    // Terms of Service URL in its public business details.
    const refusal = {
      type: "StripeInvalidRequestError",
      param: "consent_collection[terms_of_service]",
      message:
        "You cannot collect consent to your terms of service unless a URL is set in the Stripe Dashboard.",
    };

    // Act / Assert
    expect(isTermsUrlMissing(refusal)).toBe(true);
  });

  it("recognises the refusal by its message when no param is named", () => {
    // Arrange
    const refusal = {
      type: "StripeInvalidRequestError",
      message: "You cannot collect consent to your Terms of Service unless a URL is set.",
    };

    // Act / Assert
    expect(isTermsUrlMissing(refusal)).toBe(true);
  });

  it("does not swallow an unrelated Stripe refusal", () => {
    // Arrange — the round-27 outage, which must still surface as a failure.
    const other = {
      type: "StripeInvalidRequestError",
      param: "ui_mode",
      message: "Invalid ui_mode: must be one of embedded_page, hosted_page",
    };

    // Act / Assert
    expect(isTermsUrlMissing(other)).toBe(false);
  });

  it("does not treat a network or auth failure as a terms problem", () => {
    // Arrange / Act / Assert
    expect(isTermsUrlMissing({ type: "StripeConnectionError", message: "timeout" })).toBe(false);
    expect(isTermsUrlMissing(new Error("boom"))).toBe(false);
    expect(isTermsUrlMissing(null)).toBe(false);
  });
});
