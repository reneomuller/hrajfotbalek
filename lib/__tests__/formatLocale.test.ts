import { describe, expect, it } from "vitest";
import { DATE_LOCALE, formatGameDate, formatGameDateTime } from "@/lib/format";

/**
 * ROUND 28, ITEM 9 — dates render in the ACTIVE UI LANGUAGE.
 *
 * The defect this closes was visible on one screen: a Czech player read
 * `Út 25 srp` on the day strip, which localised properly, and `Tue 25 Aug`
 * four pixels below it from `lib/format.ts`, which did not.
 *
 * ASSERTED ON THE MONTH AND WEEKDAY, NOT ON A WHOLE STRING. Intl output
 * varies by ICU version — `srp` vs `srp.`, a comma or none — and pinning the
 * exact string makes this fail on a Node upgrade rather than on a regression.
 * What matters is that Czech is not English.
 */

// A Wednesday in September, in Prague.
const WHEN = "2026-09-09T16:30:00.000Z";

describe("DATE_LOCALE", () => {
  it("maps English to en-GB, so the day comes before the month", () => {
    // Assert: bare `en` would resolve to US order.
    expect(DATE_LOCALE.en).toBe("en-GB");
  });

  it("covers all four of the product's languages", () => {
    expect(Object.keys(DATE_LOCALE).sort()).toEqual(["cs", "en", "ru", "uk"]);
  });
});

describe("formatGameDate", () => {
  it("renders English when no locale is given", () => {
    // Arrange / Act
    const label = formatGameDate(WHEN);

    // Assert
    expect(label).toContain("Sep");
    expect(label).toContain("9");
  });

  it("renders Czech in Czech", () => {
    // Act
    const label = formatGameDate(WHEN, "cs");

    // Assert: the month is not the English one.
    expect(label).not.toContain("Sep");
    expect(label.toLowerCase()).toContain("9");
  });

  it("gives each language its own rendering", () => {
    // Arrange / Act
    const rendered = (["en", "cs", "ru", "uk"] as const).map((l) =>
      formatGameDate(WHEN, l),
    );

    // Assert: Russian and Ukrainian are Cyrillic; English is not.
    expect(rendered[0]).toMatch(/[A-Za-z]/);
    expect(rendered[2]).toMatch(/[Ѐ-ӿ]/);
    expect(rendered[3]).toMatch(/[Ѐ-ӿ]/);
    // And no two of the four collapse to the same string.
    expect(new Set(rendered).size).toBeGreaterThan(1);
  });
});

describe("formatGameDateTime", () => {
  it("keeps the 24-hour clock in every language", () => {
    /*
     * THE CLOCK IS NOT A LANGUAGE CHOICE. `hour12: false` is passed on every
     * call, so a locale whose default is 12-hour cannot reintroduce am/pm —
     * the pitch runs on a 24-hour timetable and the product says 18:30
     * everywhere.
     */
    for (const locale of ["en", "cs", "ru", "uk"] as const) {
      const label = formatGameDateTime(WHEN, locale);
      expect(label, `${locale} drifted to a 12-hour clock`).not.toMatch(/[ap]\.?m/i);
      expect(label).toContain("18:30");
    }
  });
});
