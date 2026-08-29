import type { Locale } from "@/lib/i18n/locales";
import { pluralise } from "@/lib/i18n/plural";
import { strings, type Strings } from "@/lib/strings";

/**
 * "5 credits" / "5 kreditů" / "5 кредитов".
 *
 * THE CREDITS RULING'S UNIT, rendered once so every surface agrees. One credit
 * is one game; the pass page, the wallet and the tier cards all count in
 * credits, and CZK sits beneath as the secondary figure rather than as the
 * headline (ruling F).
 *
 * THE FORM COMES FROM `lib/i18n/plural.ts`, which is where the whole
 * argument about CLDR categories now lives. It used to live here AND in
 * `lib/profile/statLabel.ts`, in two copies that agreed only because nobody
 * had edited either — see that file's header (round 22).
 */
export function creditsLabel(
  count: number,
  locale: Locale,
  t: Strings = strings,
): string {
  return pluralise(
    { one: t.pass.creditsOne, few: t.pass.creditsFew, many: t.pass.creditsMany },
    count,
    locale,
  );
}
