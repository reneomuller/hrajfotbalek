import { describe, expect, it } from "vitest";
import { bookingBadge, canOfferCancel } from "@/lib/booking/badges";
import { policy } from "@/lib/policy";
import { strings } from "@/lib/strings";

describe("booking badges", () => {
  it("shows paid for a confirmed qr booking", () => {
    expect(bookingBadge("confirmed", "qr")).toEqual({
      label: strings.account.badgePaid,
      tone: "paid",
    });
  });

  it("shows awaiting payment for a reserved qr booking", () => {
    expect(bookingBadge("reserved", "qr")).toEqual({
      label: strings.account.badgeReserved,
      tone: "pending",
    });
  });

  it("shows cash for a reserved cash booking, still pending", () => {
    expect(bookingBadge("reserved", "cash")).toEqual({
      label: strings.account.badgeCash,
      tone: "pending",
    });
  });

  it("shows cash as settled once an admin confirms it", () => {
    expect(bookingBadge("confirmed", "cash").tone).toBe("paid");
  });

  it("shows paid for a credit-covered booking", () => {
    expect(bookingBadge("confirmed", "credit").label).toBe(strings.account.badgePaid);
  });

  it("shows free for a seed booking", () => {
    expect(bookingBadge("confirmed", "seed_free").label).toBe(strings.account.badgeSeed);
  });

  it("lets a terminal status win over the payment method", () => {
    // A cancelled cash booking is cancelled, not cash.
    expect(bookingBadge("cancelled", "cash").label).toBe(strings.account.badgeCancelled);
    expect(bookingBadge("expired", "qr").label).toBe(strings.account.badgeExpired);
    expect(bookingBadge("cancelled", "seed_free").label).toBe(
      strings.account.badgeCancelled,
    );
  });

  it("covers all four badge kinds the criterion names", () => {
    const labels = new Set([
      bookingBadge("confirmed", "qr").label,
      bookingBadge("reserved", "qr").label,
      bookingBadge("reserved", "cash").label,
      bookingBadge("confirmed", "seed_free").label,
    ]);
    expect(labels).toEqual(
      new Set([
        strings.account.badgePaid,
        strings.account.badgeReserved,
        strings.account.badgeCash,
        strings.account.badgeSeed,
      ]),
    );
  });
});

describe("cancel affordance", () => {
  const start = new Date("2026-07-25T17:30:00Z").getTime();
  const cutoff = policy.cancellation.cutoffHoursBeforeStart;

  it("is offered before kickoff for an active booking", () => {
    expect(canOfferCancel("reserved", new Date(start).toISOString(), start - 60_000, cutoff)).toBe(true);
    expect(canOfferCancel("confirmed", new Date(start).toISOString(), start - 60_000, cutoff)).toBe(true);
  });

  it("is withdrawn at and after kickoff", () => {
    expect(canOfferCancel("confirmed", new Date(start).toISOString(), start, cutoff)).toBe(false);
    expect(canOfferCancel("confirmed", new Date(start).toISOString(), start + 60_000, cutoff)).toBe(false);
  });

  it("is never offered for a booking already in a terminal state", () => {
    expect(canOfferCancel("cancelled", new Date(start).toISOString(), start - 60_000, cutoff)).toBe(false);
    expect(canOfferCancel("expired", new Date(start).toISOString(), start - 60_000, cutoff)).toBe(false);
  });

  it("honours a non-zero cutoff if policy v2 introduces one", () => {
    // The v1 window runs to kickoff; this proves the figure is read, not baked in.
    const twoHours = 2;
    expect(
      canOfferCancel("confirmed", new Date(start).toISOString(), start - 3 * 3600_000, twoHours),
    ).toBe(true);
    expect(
      canOfferCancel("confirmed", new Date(start).toISOString(), start - 1 * 3600_000, twoHours),
    ).toBe(false);
  });
});
