import { describe, expect, it } from "vitest";
import { ratio } from "@/lib/stats/queries";

describe("ratio", () => {
  it("renders a whole percent", () => {
    expect(ratio(1, 2)).toBe("50%");
    expect(ratio(3, 4)).toBe("75%");
    expect(ratio(1, 3)).toBe("33%");
  });

  it("says nothing rather than 0% when there is no data", () => {
    // A 0% conversion rate on launch day reads as a problem; it is an empty
    // table.
    expect(ratio(0, 0)).toBe("—");
    expect(ratio(5, 0)).toBe("—");
    expect(ratio(0, -1)).toBe("—");
  });

  it("handles the full and empty ends", () => {
    expect(ratio(0, 10)).toBe("0%");
    expect(ratio(10, 10)).toBe("100%");
  });
});
