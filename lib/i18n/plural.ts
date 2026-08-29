import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";

/**
 * One number, one noun, four languages (round 22).
 *
 * WHY THIS FILE EXISTS. The collapse below was written twice before it was
 * written once — `lib/pass/credits.ts` and `lib/profile/statLabel.ts` each
 * carried their own copy, and each carried its own paragraph explaining it.
 * Two copies of a rule is how they drift, and this one is the rule that
 * decides whether a Ukrainian player reads "12 кредитів" or "12 кредита".
 * Adding a fourth language was the moment a third copy would have appeared.
 *
 * THE CATEGORIES COME FROM `Intl.PluralRules`, NEVER FROM ARITHMETIC HERE.
 * English has two forms and would survive `n === 1`. Czech, Russian and
 * Ukrainian have three, and the boundaries are not where an English speaker
 * guesses:
 *
 *   Czech      1 kredit  · 2–4 kredity  · 5+ kreditů
 *   Russian    1 кредит  · 2–4 кредита  · 5+ кредитов
 *   Ukrainian  1 кредит  · 2–4 кредити  · 5+ кредитів
 *
 * …except 11–14, which take the MANY form in Russian and Ukrainian despite
 * ending in 1–4, and except 21, which takes the SINGULAR despite being
 * twenty-one. A hand-rolled `n % 10` renders "22 кредити" correctly and
 * "12 кредити" wrongly — a translation bug that reads as fluent to anyone
 * reviewing the code in English. CLDR already knows all of this.
 *
 * THREE FORMS, NOT SIX. CLDR gives Slavic languages `one`/`few`/`many`/`other`
 * and the string table carries three, so `other` — which is where fractions
 * land — folds into `many`. That is the known soft edge and it is flagged
 * rather than hidden: the profile's hours stat carries one decimal, and "3,3
 * годин" is understandable and is not what a native speaker writes. It is on
 * the standing native-review batch. English is unaffected; every fraction is
 * `other` there, which is the plural English wants anyway.
 */

export type PluralForm = "one" | "few" | "many";

/** The three forms a countable noun needs, each carrying `{n}`. */
export type PluralForms = Readonly<Record<PluralForm, string>>;

/**
 * Which of the three forms this count takes in this language.
 *
 * Exported for the tests and for callers that pick between whole phrases
 * rather than substituting into a template.
 */
export function pluralForm(count: number, locale: Locale = DEFAULT_LOCALE): PluralForm {
  const category = new Intl.PluralRules(locale).select(count);
  if (category === "one") return "one";
  if (category === "few") return "few";
  return "many";
}

/**
 * "3 місця вільні" — the form the count takes, with the count substituted.
 *
 * `{n}` rather than a literal in the singular string, because 21 takes the
 * SINGULAR in Russian and Ukrainian: a 21-credit wallet rendering "1 кредит"
 * is the exact bug the placeholder prevents.
 */
export function pluralise(
  forms: PluralForms,
  count: number,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return forms[pluralForm(count, locale)].replace("{n}", String(count));
}
