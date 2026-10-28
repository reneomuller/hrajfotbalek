import { emailLocaleFor } from "@/lib/email/recipientLocale";
import type { EmailEnv } from "@/lib/email/templates/parts";
import { resolveStrings } from "@/lib/i18n/resolve";
import type { Locale } from "@/lib/i18n/locales";
import { refundCutoffHours } from "@/lib/policy/refundCutoff";
import { siteUrl } from "@/lib/site";

/**
 * Everything a template needs that is not its own facts, for one language.
 *
 * Its own module so the unit tests can replace it whole: the real one reads
 * the site's origin and the database's cancellation cutoff, and a template
 * test should do neither.
 */
export async function emailEnv(locale: Locale): Promise<EmailEnv> {
  const [baseUrl, cutoffHours] = await Promise.all([siteUrl(), refundCutoffHours()]);
  return { locale, t: resolveStrings(locale), baseUrl, cutoffHours };
}

/** The environment for a recipient, in the language their account asked for. */
export async function emailEnvFor(to: string | null | undefined): Promise<EmailEnv> {
  return emailEnv(await emailLocaleFor(to));
}
