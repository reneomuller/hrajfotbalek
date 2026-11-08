import { describe, expect, it } from "vitest";
import { countLabel } from "@/lib/admin/money/countLabel";

const SEATS = { one: "{n} seat", many: "{n} seats" };

describe("countLabel", () => {
  it("says one seat in the singular", () => {
    expect(countLabel(1, SEATS)).toBe("1 seat");
  });

  it("says nought and many in the plural", () => {
    expect(countLabel(0, SEATS)).toBe("0 seats");
    expect(countLabel(12, SEATS)).toBe("12 seats");
  });

  it("prints a part-paid seat to one decimal, as the seat bar does", () => {
    expect(countLabel(2.5, SEATS)).toBe("2.5 seats");
  });
});
