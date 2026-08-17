import { describe, expect, it } from "vitest";
import { statLabel } from "@/lib/profile/statLabel";
import { resolveStrings } from "@/lib/i18n/resolve";

/**
 * The caption agrees with the number above it.
 *
 * The bug this exists to stop is "1 games played" under a 34px numeral — right
 * at 0 and at 2, wrong at exactly one value, which is the value every new
 * player reaches first.
 */

const en = resolveStrings("en");
const cs = resolveStrings("cs");

describe("statLabel", () => {
  it("uses the singular at one and the plural at zero and two, in English", () => {
    // Arrange / Act / Assert
    expect(statLabel("games", 1, "en", en)).toBe("game played");
    expect(statLabel("games", 0, "en", en)).toBe("games played");
    expect(statLabel("games", 2, "en", en)).toBe("games played");
  });

  it("pluralises every stat, not only the first one", () => {
    // Arrange / Act / Assert
    expect(statLabel("hours", 1, "en", en)).toBe("hour on pitch");
    expect(statLabel("hours", 4, "en", en)).toBe("hours on pitch");
    expect(statLabel("venues", 1, "en", en)).toBe("pitch played");
    expect(statLabel("venues", 3, "en", en)).toBe("pitches played");
  });

  it("takes all three Czech forms at their CLDR boundaries", () => {
    // Czech is 1 / 2-4 / 5+, which is the case a two-form English assumption
    // gets wrong in the middle without ever looking wrong in English.

    // Arrange / Act
    const one = statLabel("games", 1, "cs", cs);
    const few = statLabel("games", 3, "cs", cs);
    const many = statLabel("games", 5, "cs", cs);

    // Assert
    expect(one).toBe("odehraný zápas");
    expect(few).toBe("odehrané zápasy");
    expect(many).toBe("odehraných zápasů");
  });

  it("does not fall back to English for a translated locale", () => {
    // The overlay merge renders English for a missing key rather than a blank,
    // which means a forgotten Czech form is invisible unless something checks.

    // Arrange / Act / Assert
    for (const count of [0, 1, 2, 5, 11, 21]) {
      expect(statLabel("games", count, "cs", cs)).not.toContain("played");
      expect(statLabel("hours", count, "cs", cs)).not.toContain("pitch");
      expect(statLabel("venues", count, "cs", cs)).not.toContain("pitch");
    }
  });
});
