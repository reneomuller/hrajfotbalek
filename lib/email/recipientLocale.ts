import { isLocale, type Locale } from "@/lib/i18n/locales";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";

/**
 * WHICH LANGUAGE A PLAYER'S EMAIL IS WRITTEN IN (round 41, owner: "identify
 * the browser's language for people to receive emails in that language … or
 * during sign up, add a communications language preference").
 *
 * Both, and the answer lives on the ACCOUNT, in the auth user's metadata:
 *
 *   `email_locale`    chosen at signup (pre-set from the browser's language)
 *                     and changeable on the account page; recorded at the next
 *                     sign-in for anyone who signed up before it existed
 *   `consent_locale`  the language the terms were read in at signup (round
 *                     40) — the best guess for an account that has no choice
 *                     recorded yet
 *
 * WHY METADATA AND NOT A COLUMN. CLAUDE.md said "doing it properly needs a
 * `players.locale` column", and that would also mean a migration the deploy
 * cannot assume — the feature would sit dormant until somebody applied it.
 * The metadata already exists for every signup since round 40, needs no grant,
 * and is written only by its own user's session. The cost is a lookup per
 * email, which is nothing at this product's volume.
 *
 * ENGLISH WHEN NOTHING IS KNOWN — what every email was before round 41, so an
 * account with no recorded language reads exactly what it always has.
 */
export const DEFAULT_EMAIL_LOCALE: Locale = "en";

export function localeFromMetadata(metadata: Record<string, unknown> | null | undefined): Locale | null {
  if (!metadata) return null;
  if (isLocale(metadata.email_locale)) return metadata.email_locale;
  if (isLocale(metadata.consent_locale)) return metadata.consent_locale;
  return null;
}

/**
 * What to record at sign-in for an account with no language yet: the one the
 * site is showing them, which is their browser's unless they chose otherwise.
 * Null when there is nothing to record. Pure, so it is testable.
 */
export function emailLocaleToRecord(
  metadata: Record<string, unknown> | null | undefined,
  siteLocale: Locale,
): Locale | null {
  return localeFromMetadata(metadata) ? null : siteLocale;
}

/**
 * The language the account asked for, or null when it never said — so a
 * caller with a better guess (the language a checkout was paid in) can use it.
 * Never throws.
 */
export async function emailLocalePreference(email: string | null | undefined): Promise<Locale | null> {
  if (!email) return null;
  try {
    const supabase = createServiceRoleSupabaseClient();
    const { data: player } = await supabase
      .from("players")
      .select("auth_user_id")
      .eq("email", email)
      .maybeSingle();
    const authUserId = (player as { auth_user_id: string | null } | null)?.auth_user_id;
    if (!authUserId) return null;

    const { data } = await supabase.auth.admin.getUserById(authUserId);
    return localeFromMetadata(data.user?.user_metadata);
  } catch {
    return null;
  }
}

/** The language for an address — English when nothing is known. */
export async function emailLocaleFor(email: string | null | undefined): Promise<Locale> {
  return (await emailLocalePreference(email)) ?? DEFAULT_EMAIL_LOCALE;
}
