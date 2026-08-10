import { describe, expect, it } from "vitest";
import { pitchHours } from "@/lib/home/pitchHours";

/**
 * The Player of the Month's hours on the pitch.
 *
 * A pure sum so the fallback and the rounding are testable without a database
 * — the fallback in particular, since a null `duration_minutes` is the ORDINARY
 * case for every game created before the column existed and would otherwise
 * silently contribute zero.
 */
describe("pitchHours", () => {
  it("sums whole games into hours", () => {
    expect(pitchHours([60, 60, 60])).toBe(3);
  });

  it("treats a null duration as the policy standard, not as zero", () => {
    // Every game created before the duration column carries null. Counting
    // those as zero would report a regular's month as an hour short per game
    // — and the number would look plausible, which is the dangerous part.
    expect(pitchHours([null, null])).toBe(2);
  });

  it("mixes real durations with fallbacks", () => {
    expect(pitchHours([90, null, 90])).toBe(4);
  });

  it("rounds to one decimal", () => {
    // 90 + 60 = 150 minutes = 2.5 hours.
    expect(pitchHours([90, 60])).toBe(2.5);
    // 50 minutes is not a round number of hours and must not pretend to be.
    expect(pitchHours([50])).toBe(0.8);
  });

  it("never renders a trailing .0 as a different number", () => {
    // 2 rather than 2.0 — the caller formats, and a float 2 is what it needs.
    expect(pitchHours([120])).toBe(2);
  });

  it("is zero for a month with nothing attended", () => {
    expect(pitchHours([])).toBe(0);
  });
});
