import { describe, expect, it } from "vitest";
import { hasBeenPlayed } from "@/lib/admin/money/playedGames";

/**
 * When a game counts as played on the money page (2026-11-08). The nightly
 * sweep marks a game `played` at 06:30 the next morning, so status alone left
 * the evening's game out of every figure until then — production's #10 kicked
 * off at 17:00 and was still "full" at half past ten.
 */
const NOW = Date.parse("2026-11-08T21:30:00.000Z");

describe("hasBeenPlayed", () => {
  it("does not count a game that is still on — it is played at its final whistle (2026-11-09)", () => {
    // Kicked off at 21:00 UTC, ninety minutes long, half an hour in.
    expect(hasBeenPlayed({ status: "full", starts_at: "2026-11-08T21:00:00.000Z", duration_minutes: 90 }, NOW)).toBe(false);
  });

  it("counts it from the final whistle", () => {
    expect(hasBeenPlayed({ status: "full", starts_at: "2026-11-08T20:00:00.000Z", duration_minutes: 90 }, NOW)).toBe(true);
  });

  it("counts a game that kicked off this evening, before the sweep marked it", () => {
    expect(hasBeenPlayed({ status: "full", starts_at: "2026-11-08T16:00:00.000Z" }, NOW)).toBe(true);
  });

  it("counts a settled game", () => {
    expect(hasBeenPlayed({ status: "settled", starts_at: "2026-11-04T19:00:00.000Z" }, NOW)).toBe(true);
  });

  it("does not count a game still ahead", () => {
    expect(hasBeenPlayed({ status: "published", starts_at: "2026-11-11T19:00:00.000Z" }, NOW)).toBe(false);
  });

  it("does not count a cancelled game, or a draft, whenever it was", () => {
    expect(hasBeenPlayed({ status: "cancelled", starts_at: "2026-11-03T19:00:00.000Z" }, NOW)).toBe(false);
    expect(hasBeenPlayed({ status: "draft", starts_at: "2026-11-03T19:00:00.000Z" }, NOW)).toBe(false);
  });
});
