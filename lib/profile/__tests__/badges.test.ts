import { describe, expect, it } from "vitest";
import { BADGE_THRESHOLDS, earnedCount, playerBadges } from "@/lib/profile/badges";
import { strings } from "@/lib/strings";
import { LOCALES } from "@/lib/i18n/locales";
import { resolveStrings } from "@/lib/i18n/resolve";
import type { ProfileStats } from "@/lib/profile/stats";

const NONE: ProfileStats = { gamesPlayed: 0, hours: 0, venues: 0 };

function at(overrides: Partial<ProfileStats>) {
  return playerBadges({ ...NONE, ...overrides }, strings);
}

function badge(stats: Partial<ProfileStats>, key: string) {
  return at(stats).find((b) => b.key === key)!;
}

describe("playerBadges", () => {
  it("locks all five for a player who has played nothing", () => {
    // Arrange / Act
    const badges = at({});

    // Assert
    expect(badges).toHaveLength(5);
    expect(badges.every((b) => !b.earned)).toBe(true);
    expect(earnedCount(badges)).toBe(0);
  });

  /*
   * THE BOUNDARY IN BOTH DIRECTIONS, per threshold.
   *
   * Read from `BADGE_THRESHOLDS` rather than restated: a test that hardcodes 5
   * keeps passing after the threshold moves to 6, which makes it a test of
   * nothing at all.
   */
  const ladder: { key: string; stat: keyof ProfileStats }[] = [
    { key: "firstGame", stat: "gamesPlayed" },
    { key: "regular", stat: "gamesPlayed" },
    { key: "veteran", stat: "gamesPlayed" },
    { key: "explorer", stat: "venues" },
    { key: "ironLegs", stat: "hours" },
  ];

  for (const { key, stat } of ladder) {
    const threshold = BADGE_THRESHOLDS[key as keyof typeof BADGE_THRESHOLDS];

    it(`earns ${key} at exactly its threshold and not one below`, () => {
      // Arrange / Act
      const below = badge({ [stat]: threshold - 1 }, key);
      const exact = badge({ [stat]: threshold }, key);

      // Assert
      expect(below.earned).toBe(false);
      expect(exact.earned).toBe(true);
    });
  }

  it("does not earn a games badge from hours or pitches", () => {
    // The three stats move independently and a badge must read only its own —
    // a player who has spent 40 hours across 9 pitches in four long games has
    // played four games.

    // Arrange / Act
    const badges = at({ gamesPlayed: 4, hours: 40, venues: 9 });
    const byKey = Object.fromEntries(badges.map((b) => [b.key, b.earned]));

    // Assert
    expect(byKey.regular).toBe(false);
    expect(byKey.veteran).toBe(false);
    expect(byKey.explorer).toBe(true);
    expect(byKey.ironLegs).toBe(true);
  });

  it("counts the earned badges for the heading", () => {
    // Arrange / Act
    const badges = at({ gamesPlayed: 5, hours: 5, venues: 1 });

    // Assert — first game and regular, and nothing else.
    expect(earnedCount(badges)).toBe(2);
  });

  it("gives every badge a translated name and requirement in all three languages", () => {
    // A missing overlay key renders English rather than a blank, so a
    // "not empty" assertion would pass on an untranslated table. This asserts
    // the CS and RU strings DIFFER from the English ones, which is the thing
    // that actually gets forgotten.

    // Arrange
    const english = playerBadges(NONE, strings);

    // Act / Assert
    for (const locale of LOCALES.filter((l) => l !== "en")) {
      const translated = playerBadges(NONE, resolveStrings(locale));

      for (const [i, b] of translated.entries()) {
        expect(b.name.length, `${locale} ${b.key} name`).toBeGreaterThan(0);
        expect(b.requirement.length, `${locale} ${b.key} requirement`).toBeGreaterThan(0);
        expect(b.name, `${locale} ${b.key} name is untranslated`).not.toBe(
          english[i].name,
        );
        expect(
          b.requirement,
          `${locale} ${b.key} requirement is untranslated`,
        ).not.toBe(english[i].requirement);
      }
    }
  });

  it("states the same number in each English hint as in its threshold", () => {
    // The one place a threshold is written down twice. A hint that says 5
    // beside a threshold of 6 is worse than no hint at all — it is a promise
    // the grid will not keep.

    // Arrange / Act
    const hints = strings.profile.badges;

    // Assert
    expect(hints.regularHint).toContain(String(BADGE_THRESHOLDS.regular));
    expect(hints.veteranHint).toContain(String(BADGE_THRESHOLDS.veteran));
    expect(hints.explorerHint).toContain(String(BADGE_THRESHOLDS.explorer));
    expect(hints.ironLegsHint).toContain(String(BADGE_THRESHOLDS.ironLegs));
    // `firstGame` says "one game" in words, which is why it is asserted apart
    // from the four numeric ones rather than being made to say "1".
    expect(hints.firstGameHint.toLowerCase()).toContain("one");
  });
});
