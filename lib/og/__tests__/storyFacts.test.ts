import { describe, expect, it } from "vitest";
import { storyAvailability, storyFacts } from "@/lib/og/storyFacts";
import { resolveStrings } from "@/lib/i18n/resolve";

/**
 * What a game's 9:16 story image says (2026-11-06). The owner: "format (only
 * players, not the pitch material), duration, and the player availability (no
 * player availability for when there are none, better to show nothing than
 * 0/x)" — then, on the first draft: "the availability line is better in the
 * app with the x spots left above it. have the format and length in one row."
 */
const cs = resolveStrings("cs");

describe("storyFacts — the one row", () => {
  it("is the format and the length", () => {
    // Act
    const facts = storyFacts({ format: "7v7", durationMinutes: 90 }, cs);

    // Assert
    expect(facts.map(({ key, value }) => [key, value])).toEqual([
      ["format", "7v7"],
      ["duration", "90 min"],
    ]);
  });

  it("leaves the format out when the game has none, rather than inventing one", () => {
    const facts = storyFacts({ format: null, durationMinutes: 60 }, cs);

    expect(facts.map(({ key }) => key)).toEqual(["duration"]);
  });

  it("falls back to the standard length for a game that recorded none", () => {
    const facts = storyFacts({ format: "5v5", durationMinutes: null }, cs);

    expect(facts.find(({ key }) => key === "duration")?.value).toMatch(/^\d+ min$/);
  });
});

describe("storyAvailability — the app's line above the bar", () => {
  it("says how many spots are left, in the app's own words", () => {
    // Act
    const line = storyAvailability({ bookedCount: 8, capacity: 14 }, "cs", cs);

    // Assert
    expect(line?.label).toBe("6 volných míst");
  });

  it("says nothing at all while nobody has booked — nothing beats 0/14", () => {
    expect(storyAvailability({ bookedCount: 0, capacity: 14 }, "cs", cs)).toBeNull();
  });
});
