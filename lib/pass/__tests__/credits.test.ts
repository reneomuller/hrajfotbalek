import { describe, expect, it } from "vitest";
import { creditsLabel } from "@/lib/pass/credits";
import { resolveStrings } from "@/lib/i18n/resolve";

/**
 * The credits ruling's plurals.
 *
 * English has two forms and gets away with `n === 1`. Czech and Russian have
 * THREE, and the boundaries are not where an English speaker guesses: Russian
 * puts 22 back in the 2–4 bucket and 11–14 in the many bucket, so a rule
 * written as `n <= 4` renders "22 кредита" correctly and "12 кредита" wrongly.
 *
 * Which is why the categories come from `Intl.PluralRules` rather than from
 * arithmetic in this repo — CLDR already knows these, and a hand-rolled
 * version is a translation bug nobody who reads the code will catch.
 */

const en = resolveStrings("en");
const cs = resolveStrings("cs");
const ru = resolveStrings("ru");

describe("creditsLabel", () => {
  it("uses the singular at one, in every language", () => {
    expect(creditsLabel(1, "en", en)).toBe("1 credit");
    expect(creditsLabel(1, "cs", cs)).toBe("1 kredit");
    expect(creditsLabel(1, "ru", ru)).toBe("1 кредит");
  });

  it("uses the 2–4 form where the language has one", () => {
    expect(creditsLabel(3, "cs", cs)).toBe("3 kredity");
    expect(creditsLabel(3, "ru", ru)).toBe("3 кредита");
    // English has no such form; it simply pluralises.
    expect(creditsLabel(3, "en", en)).toBe("3 credits");
  });

  it("uses the many form from five up — which is every real tier", () => {
    // The five tiers are 5, 8, 12, 15 and 20, so this is the form the pass
    // page actually renders on every card.
    for (const n of [5, 8, 12, 15, 20]) {
      expect(creditsLabel(n, "cs", cs)).toBe(`${n} kreditů`);
      expect(creditsLabel(n, "ru", ru)).toBe(`${n} кредитов`);
      expect(creditsLabel(n, "en", en)).toBe(`${n} credits`);
    }
  });

  it("puts the Russian teens in the many bucket, not the 2–4 one", () => {
    // 12 ends in 2 and is NOT "12 кредита". This is the case a hand-rolled
    // `n % 10` rule gets wrong, and the reason `Intl` decides it.
    expect(creditsLabel(12, "ru", ru)).toBe("12 кредитов");
    expect(creditsLabel(13, "ru", ru)).toBe("13 кредитов");
    expect(creditsLabel(14, "ru", ru)).toBe("14 кредитов");
  });

  it("puts Russian 22 back in the 2–4 bucket", () => {
    expect(creditsLabel(22, "ru", ru)).toBe("22 кредита");
    // 21 takes the SINGULAR in Russian, which is why the singular string
    // carries `{n}` rather than a literal 1 — a 21-credit wallet must not
    // render "1 кредит".
    expect(creditsLabel(21, "ru", ru)).toBe("21 кредит");
    expect(creditsLabel(21, "cs", cs)).toBe("21 kreditů");
  });

  it("handles zero, which the wallet renders at an empty balance", () => {
    expect(creditsLabel(0, "en", en)).toBe("0 credits");
    expect(creditsLabel(0, "cs", cs)).toBe("0 kreditů");
    expect(creditsLabel(0, "ru", ru)).toBe("0 кредитов");
  });
});
