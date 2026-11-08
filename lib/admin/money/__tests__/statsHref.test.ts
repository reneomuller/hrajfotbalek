import { describe, expect, it } from "vitest";
import { statsHref } from "@/lib/admin/money/statsHref";

/**
 * The money page has two pickers — the period over the money, the window over
 * operations — and each used to link to `?period=` or `?window=` alone, so
 * choosing one silently reset the other to its default.
 */
describe("statsHref", () => {
  it("carries both choices, so switching one keeps the other", () => {
    expect(statsHref("last_month", "month")).toBe("/admin/stats?period=last_month&window=month");
  });
});
