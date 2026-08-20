import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  minorUnitsToCzk,
  parseCheckoutSession,
  SIGNATURE_TOLERANCE_SECONDS,
  verifyStripeSignature,
} from "@/lib/payments/stripeWebhook";

/**
 * THE SIGNATURE IS THE ONLY THING BETWEEN THIS ENDPOINT AND THE INTERNET.
 * `/api/stripe/webhook` is public by necessity, it confirms bookings, and the
 * body names the booking to confirm — so a hole here lets a stranger seat
 * themselves for nothing. Every assertion below is about refusing something.
 */

const SECRET = "whsec_test_secret_value";

function sign(payload: string, secret = SECRET, at = Math.floor(Date.now() / 1000)) {
  const mac = createHmac("sha256", secret).update(`${at}.${payload}`, "utf8").digest("hex");
  return { header: `t=${at},v1=${mac}`, at };
}

describe("verifyStripeSignature", () => {
  it("accepts a signature Stripe would have produced", () => {
    // Arrange
    const payload = JSON.stringify({ type: "checkout.session.completed" });
    const { header } = sign(payload);

    // Act
    const result = verifyStripeSignature(payload, header, SECRET);

    // Assert
    expect(result.ok).toBe(true);
  });

  it("refuses a body that changed after signing", () => {
    // Arrange — the exact failure mode of parsing and re-serialising the body.
    const payload = JSON.stringify({ type: "checkout.session.completed", a: 1, b: 2 });
    const { header } = sign(payload);
    const reordered = JSON.stringify({ type: "checkout.session.completed", b: 2, a: 1 });

    // Act
    const result = verifyStripeSignature(reordered, header, SECRET);

    // Assert
    expect(result).toEqual({ ok: false, reason: "mismatch" });
  });

  it("refuses a signature made with a different secret", () => {
    // Arrange
    const payload = "{}";
    const { header } = sign(payload, "whsec_someone_elses_secret");

    // Act
    const result = verifyStripeSignature(payload, header, SECRET);

    // Assert
    expect(result).toEqual({ ok: false, reason: "mismatch" });
  });

  it("refuses a replay from outside the tolerance", () => {
    // Arrange — a signature that was genuine, captured, and sent again later.
    const payload = "{}";
    const now = Math.floor(Date.now() / 1000);
    const { header } = sign(payload, SECRET, now - SIGNATURE_TOLERANCE_SECONDS - 60);

    // Act
    const result = verifyStripeSignature(payload, header, SECRET, now * 1000);

    // Assert
    expect(result).toEqual({ ok: false, reason: "stale" });
  });

  it("refuses a timestamp far in the future, not only one far in the past", () => {
    // Arrange — skewing `t` forward is the obvious way round a one-sided check.
    const payload = "{}";
    const now = Math.floor(Date.now() / 1000);
    const { header } = sign(payload, SECRET, now + SIGNATURE_TOLERANCE_SECONDS + 60);

    // Act
    const result = verifyStripeSignature(payload, header, SECRET, now * 1000);

    // Assert
    expect(result).toEqual({ ok: false, reason: "stale" });
  });

  it("accepts any one of several v1 signatures, as during a secret rotation", () => {
    // Arrange
    const payload = "{}";
    const at = Math.floor(Date.now() / 1000);
    const good = createHmac("sha256", SECRET).update(`${at}.${payload}`).digest("hex");
    const header = `t=${at},v1=${"0".repeat(good.length)},v1=${good}`;

    // Act
    const result = verifyStripeSignature(payload, header, SECRET);

    // Assert
    expect(result.ok).toBe(true);
  });

  it("refuses a missing or malformed header rather than throwing", () => {
    // A forged signature of the wrong LENGTH is the ordinary case, and
    // `timingSafeEqual` throws on a length mismatch instead of returning false.
    expect(verifyStripeSignature("{}", null, SECRET)).toEqual({
      ok: false,
      reason: "no_signature",
    });
    expect(verifyStripeSignature("{}", "nonsense", SECRET)).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(verifyStripeSignature("{}", "t=abc,v1=deadbeef", SECRET)).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(verifyStripeSignature("{}", `t=${Math.floor(Date.now() / 1000)},v1=ab`, SECRET)).toEqual(
      { ok: false, reason: "mismatch" },
    );
  });
});

describe("parseCheckoutSession", () => {
  const session = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          client_reference_id: "11111111-1111-1111-1111-111111111111",
          amount_total: 45000,
          currency: "czk",
          ...over,
        },
      },
    });

  it("pulls the four fields the handler needs", () => {
    // Act
    const parsed = parseCheckoutSession(session());

    // Assert
    expect(parsed).toEqual({
      id: "cs_test_123",
      clientReferenceId: "11111111-1111-1111-1111-111111111111",
      amountTotal: 45000,
      currency: "czk",
    });
  });

  it("ignores an event of any other type", () => {
    // Arrange
    const other = JSON.stringify({ type: "payment_intent.succeeded", data: { object: {} } });

    // Act + Assert
    expect(parseCheckoutSession(other)).toBeNull();
  });

  it("returns null rather than throwing on a body that is not JSON", () => {
    expect(parseCheckoutSession("not json")).toBeNull();
    expect(parseCheckoutSession("null")).toBeNull();
  });

  /*
   * THE TWO NULLS THAT MATTER. A missing `amount_total` read as 0 would flag a
   * paid booking as underpaid; read as "skip the check" it would seat an
   * unpaid one. Both are surfaced as null so the route can refuse to guess.
   */
  it("reports a missing amount and a missing reference as null, never as a default", () => {
    expect(parseCheckoutSession(session({ amount_total: null }))?.amountTotal).toBeNull();
    expect(parseCheckoutSession(session({ amount_total: "45000" }))?.amountTotal).toBeNull();
    expect(
      parseCheckoutSession(session({ client_reference_id: null }))?.clientReferenceId,
    ).toBeNull();
  });
});

describe("minorUnitsToCzk", () => {
  it("converts haléře to koruny", () => {
    expect(minorUnitsToCzk(15000)).toBe(150);
    expect(minorUnitsToCzk(45000)).toBe(450);
  });

  it("rounds DOWN, so a payment one haléř short cannot read as exact", () => {
    expect(minorUnitsToCzk(14999)).toBe(149);
  });
});
