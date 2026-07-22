import { describe, expect, it } from "vitest";
import { parseUnderpayment, toAdminErrorMessage } from "@/lib/admin/errors";
import { strings } from "@/lib/strings";

describe("toAdminErrorMessage", () => {
  it("recognises a raised code inside PostgREST's framing text", () => {
    expect(
      toAdminErrorMessage('unexpected: CAPACITY_BELOW_ACTIVE_BOOKINGS (active bookings: 8)'),
    ).toBe(strings.admin.capacityBelowBooked);
  });

  it("maps a CHECK-constraint name to the field it guards", () => {
    expect(toAdminErrorMessage('violates check constraint "venues_image_path_format"')).toBe(
      strings.admin.venueImageInvalid,
    );
  });

  it("falls back to the generic message rather than echoing a driver error", () => {
    const raw = 'duplicate key value violates unique constraint "players_pkey"';
    expect(toAdminErrorMessage(raw)).toBe(strings.errors.generic);
    expect(toAdminErrorMessage(raw)).not.toContain("players_pkey");
  });

  it("handles a missing message", () => {
    expect(toAdminErrorMessage(null)).toBe(strings.errors.generic);
    expect(toAdminErrorMessage(undefined)).toBe(strings.errors.generic);
  });
});

describe("parseUnderpayment", () => {
  it("reads the shortfall from the raise detail", () => {
    expect(parseUnderpayment("PAYMENT_UNDERPAID: received 150 of 200")).toBe(50);
  });

  it("returns 0 rather than a negative when the detail is inverted", () => {
    expect(parseUnderpayment("PAYMENT_UNDERPAID: received 250 of 200")).toBe(0);
  });

  it("is null for every error that is not an underpayment", () => {
    expect(parseUnderpayment("INVALID_TRANSITION: booking status is confirmed")).toBeNull();
    expect(parseUnderpayment("INSUFFICIENT_PERMISSION")).toBeNull();
    expect(parseUnderpayment(null)).toBeNull();
  });

  it("is null when the code is present but the detail is not parseable", () => {
    expect(parseUnderpayment("PAYMENT_UNDERPAID")).toBeNull();
  });
});
