import type { Locale } from "@/lib/i18n/locales";
import { pluralForm } from "@/lib/i18n/plural";
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
 * THE FORM COMES FROM `lib/i18n/plural.ts` — shared with `creditsLabel` since
 * round 22, so the two helpers cannot disagree about which form a number
 * takes. The decimal soft edge (hours carries one) is documented there.
 *
 * IT PICKS A WHOLE STRING RATHER THAN SUBSTITUTING INTO ONE, which is why this
 * calls `pluralForm` and not `pluralise`: the number is a 34px figure in its
 * own element and only the noun beneath it changes, so the template carries no
 * `{n}` to substitute.
 */

export type StatKey = "games" | "hours" | "venues" | "met";

const FORMS: Record<StatKey, { one: keyof Strings["profile"]; few: keyof Strings["profile"]; many: keyof Strings["profile"] }> = {
  games: { one: "statGamesOne", few: "statGamesFew", many: "statGamesMany" },
  hours: { one: "statHoursOne", few: "statHoursFew", many: "statHoursMany" },
  venues: { one: "statVenuesOne", few: "statVenuesFew", many: "statVenuesMany" },
  /*
   * PLAYERS MET (round 23). Counted people, so it takes the same three forms
   * as everything else here — and Czech's 2-4 form is the one an English
   * speaker would never guess: `2 potkaní hráči`, not `2 potkaných hráčů`.
   */
  met: { one: "statMetOne", few: "statMetFew", many: "statMetMany" },
};

export function statLabel(
  key: StatKey,
  count: number,
  locale: Locale,
  t: Strings = strings,
): string {
  return t.profile[FORMS[key][pluralForm(count, locale)]] as string;
}
