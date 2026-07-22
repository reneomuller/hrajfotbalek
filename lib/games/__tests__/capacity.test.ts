import { describe, expect, it } from "vitest";
import { capacitySegments } from "@/lib/games/capacity";

describe("capacitySegments", () => {
  it("renders one notch per spot, not a proportional bar", () => {
    expect(capacitySegments(8, 14)).toHaveLength(14);
    expect(capacitySegments(0, 14)).toHaveLength(14);
    expect(capacitySegments(14, 14)).toHaveLength(14);
  });

  it("fills the first `bookedCount` notches in order", () => {
    expect(capacitySegments(3, 5)).toEqual([true, true, true, false, false]);
  });

  it("never fills past capacity when the roster exceeds it", () => {
    // An admin lowering capacity below the current roster must not grow the bar.
    expect(capacitySegments(20, 14).filter(Boolean)).toHaveLength(14);
    expect(capacitySegments(20, 14)).toHaveLength(14);
  });

  it("treats a negative or zero count as empty", () => {
    expect(capacitySegments(-3, 4)).toEqual([false, false, false, false]);
    expect(capacitySegments(0, 0)).toEqual([]);
  });
});
