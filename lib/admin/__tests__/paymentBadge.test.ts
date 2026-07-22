import { describe, expect, it } from "vitest";
import { adminPaymentBadge } from "@/lib/admin/paymentBadge";
import { strings } from "@/lib/strings";

describe("adminPaymentBadge", () => {
  it("marks a confirmed QR booking paid", () => {
    expect(adminPaymentBadge("confirmed", "qr")).toEqual({
      label: strings.admin.badge.paid,
      tone: "paid",
    });
  });

  it("distinguishes cash-owed from QR-owed while both are reserved", () => {
    expect(adminPaymentBadge("reserved", "cash").label).toBe(strings.admin.badge.cash);
    expect(adminPaymentBadge("reserved", "qr").label).toBe(strings.admin.badge.reserved);
  });

  it("treats a confirmed cash booking as paid, not as cash owed", () => {
    expect(adminPaymentBadge("confirmed", "cash").tone).toBe("paid");
  });

  it("reads seed and credit bookings as settled — there is nothing to collect", () => {
    expect(adminPaymentBadge("reserved", "seed_free").tone).toBe("paid");
    expect(adminPaymentBadge("reserved", "credit").tone).toBe("paid");
  });

  it("lets a terminal status win over the method", () => {
    expect(adminPaymentBadge("cancelled", "cash").label).toBe(strings.admin.badge.cancelled);
    expect(adminPaymentBadge("expired", "qr").label).toBe(strings.admin.badge.expired);
    expect(adminPaymentBadge("cancelled", "seed_free").tone).toBe("muted");
  });
});
