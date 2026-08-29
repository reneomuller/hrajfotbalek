/**
 * The three languages, and how a request's language is decided.
 *
 * English is the main language — it is the one the string table is written in
 * (`lib/strings.ts`), the one every key is guaranteed to have, and the fallback
 * whenever a translation is missing. Czech and Russian are overlays on top of
 * it, not parallel tables: a missing Czech key renders English rather than a
 * key name or a blank, which is the failure mode that matters when copy is
 * added faster than it is translated.
 *
 * WHY THESE THREE. The games are in Prague and the crew is a mix — Czech
 * locals, Russian-speaking regulars, and the English-speaking expats and
 * visitors who find the group through a shared link. English leads because it
 * is the only one all three groups read.
 *
 * WHAT IS NOT TRANSLATED, and why:
 *   - The admin panel. One person uses it, in English.
 *   - The privacy page. That is legal text, supplied per language by a human,
 *     not a UI string.
 *   - Transactional email. There is no per-player language anywhere in the
 *     database — the locale here is a cookie, which is a fact about a browser,
 *     not about a person. Translating email off a cookie would send Czech to a
 *     Russian speaker whenever a cron job, rather than a request, sends it.
 *     Doing it properly needs a `players.locale` column; it is on the backlog.
 *   - Anything about money. See `lib/i18n/README` note in `resolve.ts`.
 */

export const LOCALES = ["en", "cs", "ru", "uk"] as const;

export type Locale = (typeof LOCALES)[number];

/**
 * What an anonymous visitor with no stored choice sees (owner iteration,
 * Section 1).
 *
 * CZECH, NOT ENGLISH. The games are in Prague and most people arriving from a
 * shared WhatsApp link are Czech speakers; English led because it is the
 * language the string table is WRITTEN in, which is a fact about the codebase
 * rather than about the audience.
 *
 * IT IS A DEFAULT AND NOT A FORCING. The resolution order in
 * `lib/i18n/server.ts` is unchanged and this sits LAST in it:
 *
 *   1. the `hf_locale` cookie — an explicit choice, and it always wins
 *   2. `Accept-Language` — the browser's own preference
 *   3. this
 *
 * So a Russian speaker's browser still gets Russian, anyone who has touched
 * the switcher keeps what they chose, and this only decides the case where
 * nothing else has an opinion.
 *
 * ENGLISH REMAINS THE FALLBACK FOR MISSING COPY, which is a different job:
 * `resolveStrings` merges the Czech and Russian overlays onto the English
 * table, so an untranslated key renders English rather than a blank. Changing
 * this constant does not touch that.
 */
export const DEFAULT_LOCALE: Locale = "cs";

/**
 * The cookie carrying the choice.
 *
 * A cookie rather than a URL prefix or a subdomain: the language is a
 * preference, not part of a game's identity, and every game link that has ever
 * been shared in WhatsApp points at `/game/<id>` with no locale segment. Adding
 * one now would either break those links or require a permanent redirect layer
 * to keep them alive. A cookie leaves every existing link working and lets the
 * same URL render in whichever language the person opening it prefers.
 *
 * The cost is that pages must be rendered per request rather than cached
 * per URL — which they already are: `/games` and `/game/[id]` are both
 * `force-dynamic` because a cached spots-left count is a wrong one.
 */
export const LOCALE_COOKIE = "hf_locale";

/** A year. The preference should outlive the session it was set in. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * How each language names itself, in itself.
 *
 * Never "Czech" in an English list — someone looking for their own language
 * scans for the word they would use for it, which is the word in that
 * language. The short code is what the switcher renders on a phone.
 */
export const LOCALE_LABELS: Record<Locale, { short: string; full: string }> = {
  en: { short: "EN", full: "English" },
  cs: { short: "CZ", full: "Čeština" },
  ru: { short: "RU", full: "Русский" },
  uk: { short: "UA", full: "Українська" },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Picks a language from an `Accept-Language` header.
 *
 * Used only for a visitor with no cookie yet — a first-time arrival from a
 * shared link, which is the most common way anyone reaches this product. It
 * reads the header in the browser's own priority order and takes the first
 * supported match, so a Czech phone gets Czech on the first paint rather than
 * after finding the switcher.
 *
 * Deliberately simple: no q-value arithmetic. Browsers already send the list
 * in preference order, and the only decision here is between three languages.
 */
export function localeFromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;

  for (const part of header.split(",")) {
    // "cs-CZ;q=0.9" -> "cs"
    const tag = part.split(";")[0].trim().toLowerCase();
    if (!tag) continue;
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }

  return null;
}
