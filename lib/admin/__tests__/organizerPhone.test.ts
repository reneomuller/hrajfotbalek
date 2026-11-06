import { describe, expect, it } from "vitest";
import { phoneAfterOrganizerChange } from "@/lib/admin/organizerPhone";

/**
 * Round 42 — the owner: "when choosing an organizer, pre-fill their phone
 * number". The number is the one the game's Message button dials, so a
 * number left over from the organizer being replaced is the one to avoid.
 */
describe("phoneAfterOrganizerChange", () => {
  it("fills in the chosen organizer's number", () => {
    expect(phoneAfterOrganizerChange("", null, "+420 601 000 001")).toBe("+420 601 000 001");
  });

  it("replaces the previous organizer's number with the new one's", () => {
    expect(phoneAfterOrganizerChange("+420 601 000 001", "+420 601 000 001", "+420 602 000 002")).toBe(
      "+420 602 000 002",
    );
  });

  it("clears the previous organizer's number when the new one has none", () => {
    expect(phoneAfterOrganizerChange("+420 601 000 001", "+420 601 000 001", null)).toBe("");
  });

  it("keeps a number typed by hand when the new organizer has none", () => {
    expect(phoneAfterOrganizerChange("+420 222 333 444", "+420 601 000 001", null)).toBe("+420 222 333 444");
  });
});
