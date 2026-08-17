import type { Locale } from "@/lib/i18n/locales";
import { strings, type Strings } from "@/lib/strings";

/**
 * The caption under a profile stat, agreeing with the number above it.
 *
 * WHY THIS IS NOT A CONSTANT STRING. The reference screen shows
 * "0 games played", and a fixed plural caption is right at 0 and at 2 and wrong
 * at 1 — "1 games played" under a 34px numeral reads as a bug, because it is
 * one. The number and the noun are separate elements here (big figure, small
 * caption) so the template carries no `{n}`; only the noun changes.
 *
 * THE CATEGORIES COME FROM `Intl.PluralRules`, for the reasons
 * `lib/pass/credits.ts` sets out at length and which are not restated: English
 * would survive `n === 1`, Czech and Russian have three forms with boundaries
 * an English speaker guesses wrong, and CLDR already knows all of them. The
 * same three-way collapse is used here — `one`, `few`, everything else — so the
 * two helpers cannot disagree about which form a number takes.
 *
 * DECIMALS ARE THE KNOWN SOFT EDGE, and it is flagged rather than hidden. Hours
 * carries one decimal, and CLDR routes a fractional Czech or Russian quantity
 * to a category (`many`) that this collapse folds into the 5+ form. "3,3 hodin"
 * is understandable and is not what a Czech speaker writes — it is on the
 * standing native-review batch with the rest of the CS/RU drafts. English is
 * unaffected: every fraction is `other` there, which is the plural it wants.
 */

export type StatKey = "games" | "hours" | "venues";

const FORMS: Record<StatKey, { one: keyof Strings["profile"]; few: keyof Strings["profile"]; many: keyof Strings["profile"] }> = {
  games: { one: "statGamesOne", few: "statGamesFew", many: "statGamesMany" },
  hours: { one: "statHoursOne", few: "statHoursFew", many: "statHoursMany" },
  venues: { one: "statVenuesOne", few: "statVenuesFew", many: "statVenuesMany" },
};

export function statLabel(
  key: StatKey,
  count: number,
  locale: Locale,
  t: Strings = strings,
): string {
  const category = new Intl.PluralRules(locale).select(count);
  const forms = FORMS[key];

  const form =
    category === "one" ? forms.one : category === "few" ? forms.few : forms.many;

  return t.profile[form] as string;
}
