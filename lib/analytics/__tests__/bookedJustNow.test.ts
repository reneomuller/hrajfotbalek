import { describe, expect, it } from "vitest";
import { bookedJustNow } from "@/lib/analytics/paidCheckout";

/**
 * `?booked=1` reports `game_booked` only for a booking made in the last hour
 * (2026-11-12), so adding it to an old confirmation link books nothing twice.
 */
const NOW = Date.parse("2026-11-12T20:00:00.000Z");

describe("bookedJustNow", () => {
  it("is true for a booking made minutes ago", () => {
    expect(bookedJustNow("2026-11-12T19:55:00.000Z", NOW)).toBe(true);
  });

  it("is false for a booking from yesterday", () => {
    expect(bookedJustNow("2026-11-11T19:55:00.000Z", NOW)).toBe(false);
  });
});
