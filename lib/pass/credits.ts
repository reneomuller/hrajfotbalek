import type { Locale } from "@/lib/i18n/locales";
import { strings, type Strings } from "@/lib/strings";

/**
 * "5 credits" / "5 kreditů" / "5 кредитов".
 *
 * THE CREDITS RULING'S UNIT, rendered once so every surface agrees. One credit
 * is one game; the pass page, the wallet and the tier cards all count in
 * credits, and CZK sits beneath as the secondary figure rather than as the
 * headline (ruling F).
 *
 * THE CATEGORIES COME FROM `Intl.PluralRules`, NOT FROM ARITHMETIC HERE.
 * English has two forms and would survive `n === 1`. Czech and Russian have
 * three, and the boundaries are not where an English speaker guesses:
 *
 *   - Czech:  1 kredit · 2–4 kredity · 5+ kreditů
 *   - Russian: 1 кредит · 2–4 кредита · 5+ кредитов
 *     …except 11–14, which take the MANY form despite ending in 1–4, and
 *     except 21, which takes the SINGULAR despite being twenty-one.
 *
 * A hand-rolled `n % 10` rule renders "22 кредита" correctly and "12 кредита"
 * wrongly, which is a translation bug that reads as fluent to anyone reviewing
 * the code in English. CLDR already knows all of this, so it decides.
 *
 * The three CLDR categories are collapsed onto the two the string table needs
 * beyond the singular: `few` where a language has a 2–4 form, and everything
 * else to `many`. That mapping is what makes one call site serve all three
 * languages — Czech routes 5+ through `other` and Russian through `many`, and
 * both land on the same string.
 */
export function creditsLabel(
  count: number,
  locale: Locale,
  t: Strings = strings,
): string {
  const category = new Intl.PluralRules(locale).select(count);

  const template =
    category === "one"
      ? t.pass.creditsOne
      : category === "few"
        ? t.pass.creditsFew
        : t.pass.creditsMany;

  return template.replace("{n}", String(count));
}
