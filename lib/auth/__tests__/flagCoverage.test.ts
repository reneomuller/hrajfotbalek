import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COUNTRY_CODES } from "@/lib/auth/countries";

/**
 * ROUND 35 v2, ITEM 6 — every country the signup offers has a flag on disk.
 *
 * THIS IS THE ASSERTION THAT MAKES `scripts/sync-flags.mjs` SAFE TO FORGET.
 * The asset directory is derived from `lib/auth/countries.ts`, so adding a
 * country there without re-running the script would render a broken image on
 * somebody's profile — a 404 that looks like a styling bug. It fails here
 * instead, naming the code.
 *
 * ROW 212 CLOSES HERE. "Four of 249" was the honest limit for four rounds; the
 * list is 197 and the coverage is all of it.
 */
describe("flag coverage", () => {
  it("has a flag for every country in the signup list", () => {
    const missing = COUNTRY_CODES.filter(
      (code) => !existsSync(`public/flags/3x2/${code}.svg`),
    );
    expect(
      missing,
      `no flag asset for: ${missing.join(", ")} — run node scripts/sync-flags.mjs`,
    ).toEqual([]);
  });

  it("covers a country that is not one of the original four", () => {
    // The guard against a regression to the hand-drawn set.
    for (const code of ["PT", "BR", "NG", "VN"]) {
      expect(COUNTRY_CODES).toContain(code);
      expect(existsSync(`public/flags/3x2/${code}.svg`), `${code} has no flag`).toBe(true);
    }
  });
});
