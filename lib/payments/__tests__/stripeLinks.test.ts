import { afterEach, describe, expect, it } from "vitest";
import {
  stripeBookingUrl,
  stripePassUrl,
  stripePassUrls,
  withStripeParams,
} from "@/lib/payments/stripeLinks";

const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("withStripeParams", () => {
  it("stamps the reference and the email", () => {
    // Arrange
    const base = "https://buy.stripe.com/test_abc";

    // Act
    const out = withStripeParams(base, { reference: "bk_1", email: "a@b.com" });

    // Assert
    const url = new URL(out!);
    expect(url.searchParams.get("client_reference_id")).toBe("bk_1");
    expect(url.searchParams.get("prefilled_email")).toBe("a@b.com");
  });

  /*
   * THE CASE A NAIVE `url + "?a=b"` BREAKS. Stripe Payment Links routinely
   * carry `?locale=` or a UTM tag, and a second `?` silently orphans the
   * first set.
   */
  it("preserves query params the link already carries", () => {
    // Arrange
    const base = "https://buy.stripe.com/test_abc?locale=cs&utm_source=hf";

    // Act
    const out = withStripeParams(base, { reference: "bk_2", email: null });

    // Assert
    const url = new URL(out!);
    expect(url.searchParams.get("locale")).toBe("cs");
    expect(url.searchParams.get("utm_source")).toBe("hf");
    expect(url.searchParams.get("client_reference_id")).toBe("bk_2");
    expect(url.searchParams.get("prefilled_email")).toBeNull();
  });

  it("overwrites rather than duplicating a key the link already has", () => {
    // Arrange
    const base = "https://buy.stripe.com/x?client_reference_id=stale";

    // Act
    const out = withStripeParams(base, { reference: "fresh", email: null });

    // Assert — one value, not two for the server to choose between.
    expect(out!.match(/client_reference_id/g)).toHaveLength(1);
    expect(new URL(out!).searchParams.get("client_reference_id")).toBe("fresh");
  });

  it("url-encodes an address that needs it", () => {
    // Arrange
    const base = "https://buy.stripe.com/x";

    // Act
    const out = withStripeParams(base, { reference: "r", email: "a+tag@b.com" });

    // Assert — the raw `+` would decode as a space on the far side.
    expect(out).toContain("prefilled_email=a%2Btag%40b.com");
  });

  it("returns null for a link that does not parse", () => {
    // Arrange / Act
    const out = withStripeParams("not a url", { reference: "r" });

    // Assert
    expect(out).toBeNull();
  });
});

describe("stripePassUrls", () => {
  it("reads a tier map keyed by game count", () => {
    // Arrange
    process.env.NEXT_PUBLIC_STRIPE_PASS_URLS = '{"5":"https://buy.stripe.com/five"}';

    // Act / Assert
    expect(stripePassUrl(5)).toBe("https://buy.stripe.com/five");
    expect(stripePassUrl(12)).toBeNull();
  });

  /* The template's resting state: every key present, no links yet. */
  it("treats an empty value as not configured", () => {
    // Arrange
    process.env.NEXT_PUBLIC_STRIPE_PASS_URLS = '{"5":"","8":"  "}';

    // Act / Assert
    expect(stripePassUrl(5)).toBeNull();
    expect(stripePassUrl(8)).toBeNull();
  });

  /*
   * A stray comma in a dashboard variable must not take the pass page down
   * for everyone — every tier falls back to the existing rail instead.
   */
  it("ignores malformed JSON instead of throwing", () => {
    // Arrange
    process.env.NEXT_PUBLIC_STRIPE_PASS_URLS = "{oops";

    // Act / Assert
    expect(stripePassUrls()).toEqual({});
    expect(stripePassUrl(5)).toBeNull();
  });

  it("ignores a JSON array, which is not a tier map", () => {
    // Arrange
    process.env.NEXT_PUBLIC_STRIPE_PASS_URLS = '["https://buy.stripe.com/x"]';

    // Act / Assert
    expect(stripePassUrls()).toEqual({});
  });
});

describe("stripeBookingUrl", () => {
  it("treats an empty variable as not configured", () => {
    // Arrange
    process.env.NEXT_PUBLIC_STRIPE_PAYMENT_URL = "   ";

    // Act / Assert
    expect(stripeBookingUrl()).toBeNull();
  });
});
