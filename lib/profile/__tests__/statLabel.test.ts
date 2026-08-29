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
const uk = resolveStrings("uk");

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

  it("takes all three Ukrainian forms at their CLDR boundaries", () => {
    /*
     * 1 / 2-4 / 5+, tested at the same three numbers as Czech above so the two
     * languages can be compared line by line — and tested at all, because
     * `Intl.PluralRules("uk")` is what decides and nothing in this repo
     * asserts that it agrees with Russian.
     */

    // Arrange / Act
    const one = statLabel("games", 1, "uk", uk);
    const few = statLabel("games", 3, "uk", uk);
    const many = statLabel("games", 5, "uk", uk);

    // Assert
    expect(one).toBe("зіграна гра");
    expect(few).toBe("зіграні ігри");
    expect(many).toBe("зіграних ігор");
  });

  it("pluralises every Ukrainian stat, not only the first", () => {
    // Arrange / Act / Assert
    expect(statLabel("hours", 1, "uk", uk)).toBe("година на полі");
    expect(statLabel("hours", 3, "uk", uk)).toBe("години на полі");
    expect(statLabel("hours", 5, "uk", uk)).toBe("годин на полі");
    expect(statLabel("venues", 1, "uk", uk)).toBe("майданчик");
    expect(statLabel("venues", 3, "uk", uk)).toBe("майданчики");
    expect(statLabel("venues", 5, "uk", uk)).toBe("майданчиків");
  });

  it("does not fall back to English for a translated locale", () => {
    // The overlay merge renders English for a missing key rather than a blank,
    // which means a forgotten Czech form is invisible unless something checks.

    // Arrange / Act / Assert
    for (const count of [0, 1, 2, 5, 11, 21]) {
      for (const [locale, t] of [["cs", cs], ["uk", uk]] as const) {
        expect(statLabel("games", count, locale, t)).not.toContain("played");
        expect(statLabel("hours", count, locale, t)).not.toContain("pitch");
        expect(statLabel("venues", count, locale, t)).not.toContain("pitch");
      }
    }
  });
});
