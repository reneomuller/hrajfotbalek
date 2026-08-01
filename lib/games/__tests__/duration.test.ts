import { describe, expect, it } from "vitest";
import { gameEndsAt, isInProgress, resolveDurationMinutes } from "@/lib/games/duration";
import { DEFAULT_DURATION_MINUTES } from "@/lib/calendar/ics";
import { policy } from "@/lib/policy";

/**
 * Phase 2 §5.2 / REQ-GAME-008.
 *
 * The requirement is not "a duration renders" — it is that FOUR surfaces read
 * the same per-game value and fall back the same way. A render site left on
 * the constant produces a game whose calendar entry disagrees with its own
 * page, and nothing about that failure is loud.
 *
 * These assert the resolver. The per-surface tests live beside each surface —
 * `ics.test.ts` for DTEND, `schemaOrg.test.ts` for endDate — and all of them
 * now route through this module.
 */

const START = "2026-08-02T17:30:00.000Z";

describe("resolveDurationMinutes", () => {
  it("takes the per-game value when the organizer stated one", () => {
    expect(resolveDurationMinutes(90)).toBe(90);
    expect(resolveDurationMinutes(30)).toBe(30);
    expect(resolveDurationMinutes(180)).toBe(180);
  });

  it("falls back to the policy constant for a game with no duration recorded", () => {
    expect(resolveDurationMinutes(null)).toBe(policy.game.durationMinutes);
    expect(resolveDurationMinutes(undefined)).toBe(policy.game.durationMinutes);
  });

  it("keeps the .ics default and the policy constant as ONE value, not two that agree", () => {
    // `lib/calendar/ics.ts` carried its own `90` while the policy module
    // carried another. Two constants that must match with nothing enforcing it
    // is a calendar entry that contradicts the page it came from.
    expect(DEFAULT_DURATION_MINUTES).toBe(policy.game.durationMinutes);
    expect(DEFAULT_DURATION_MINUTES).toBe(resolveDurationMinutes(null));
  });
});

describe("gameEndsAt", () => {
  it("adds the per-game duration to the start", () => {
    expect(gameEndsAt(START, 90).toISOString()).toBe("2026-08-02T19:00:00.000Z");
  });

  it("adds the fallback when the duration is null", () => {
    const end = gameEndsAt(START, null);
    expect(end.getTime() - Date.parse(START)).toBe(policy.game.durationMinutes * 60_000);
  });

  it("refuses an unparseable start rather than inventing an end", () => {
    expect(() => gameEndsAt("not a date", 60)).toThrow(TypeError);
  });
});

describe("isInProgress", () => {
  const start = Date.parse(START);

  it("is false before kick-off", () => {
    expect(isInProgress(START, 60, start - 60_000)).toBe(false);
  });

  it("is true at kick-off and while the game runs", () => {
    expect(isInProgress(START, 60, start)).toBe(true);
    expect(isInProgress(START, 60, start + 59 * 60_000)).toBe(true);
  });

  it("is false once the per-game duration has elapsed", () => {
    expect(isInProgress(START, 60, start + 60 * 60_000)).toBe(false);
  });

  it("uses the per-game duration, not the constant — a 90-minute game runs longer", () => {
    // The whole point of the column: at start + 70 minutes a 60-minute game is
    // over and a 90-minute one is not, and the page must not say the same thing
    // about both.
    const seventyMinutesIn = start + 70 * 60_000;
    expect(isInProgress(START, 60, seventyMinutesIn)).toBe(false);
    expect(isInProgress(START, 90, seventyMinutesIn)).toBe(true);
  });

  it("falls back for a game with no duration recorded", () => {
    const justInside = start + (policy.game.durationMinutes - 1) * 60_000;
    const justOutside = start + policy.game.durationMinutes * 60_000;
    expect(isInProgress(START, null, justInside)).toBe(true);
    expect(isInProgress(START, null, justOutside)).toBe(false);
  });
});
