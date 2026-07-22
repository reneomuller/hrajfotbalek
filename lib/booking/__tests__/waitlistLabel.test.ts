import { describe, expect, it } from "vitest";
import { waitlistPositionLabel } from "@/lib/booking/waitlistLabel";

describe("waitlistPositionLabel", () => {
  it("renders the position the RPC reported", () => {
    expect(waitlistPositionLabel(2)).toBe("You're #2 in line");
    expect(waitlistPositionLabel(1)).toBe("You're #1 in line");
    expect(waitlistPositionLabel(11)).toBe("You're #11 in line");
  });

  it("says nothing when there is no position", () => {
    expect(waitlistPositionLabel(null)).toBeNull();
  });

  it("refuses to invent a position from a nonsense value", () => {
    expect(waitlistPositionLabel(0)).toBeNull();
    expect(waitlistPositionLabel(-1)).toBeNull();
    expect(waitlistPositionLabel(1.5)).toBeNull();
    expect(waitlistPositionLabel(Number.NaN)).toBeNull();
  });

  it("never leaks the placeholder token", () => {
    expect(waitlistPositionLabel(3)).not.toContain("{position}");
  });
});
