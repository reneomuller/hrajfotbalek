import { describe, expect, it } from "vitest";
import { POSITIONS, isPosition, normalisePositions, positionLabel } from "@/lib/players/positions";
import { resolveStrings } from "@/lib/i18n/resolve";

describe("normalisePositions", () => {
  it("keeps only catalog codes", () => {
    // The CHECK would refuse anything else with a constraint-name error the
    // form cannot explain, so the form never sends one.
    expect(normalisePositions(["gk", "striker", "mid"])).toEqual(["gk", "mid"]);
  });

  it("dedupes", () => {
    expect(normalisePositions(["mid", "mid"])).toEqual(["mid"]);
  });

  it("normalises ORDER, so two players who tick the same chips match", () => {
    expect(normalisePositions(["att", "gk"])).toEqual(["gk", "att"]);
    expect(normalisePositions(["gk", "att"])).toEqual(["gk", "att"]);
  });

  it("returns an empty array for nothing selected — the normal state", () => {
    // Every player predating the column has none, and the column defaults to
    // an empty array rather than null for exactly that reason.
    expect(normalisePositions([])).toEqual([]);
  });
});

describe("isPosition", () => {
  it("accepts the four and refuses everything else", () => {
    for (const code of POSITIONS) expect(isPosition(code)).toBe(true);
    for (const junk of ["", "GK", "sweeper", null, 3]) expect(isPosition(junk)).toBe(false);
  });
});

describe("positionLabel", () => {
  it("has a label in every language for every code", () => {
    for (const locale of ["en", "cs", "ru"] as const) {
      const t = resolveStrings(locale);
      for (const code of POSITIONS) {
        const label = positionLabel(code, t);
        expect(label, `${locale}/${code}`).toBeTruthy();
        expect(label, `${locale}/${code}`).not.toBe(code);
      }
    }
  });

  it("translates — the Czech and Russian are not the English", () => {
    const en = resolveStrings("en");
    for (const locale of ["cs", "ru"] as const) {
      const t = resolveStrings(locale);
      for (const code of POSITIONS) {
        expect(positionLabel(code, t), `${locale}/${code}`).not.toBe(positionLabel(code, en));
      }
    }
  });
});
