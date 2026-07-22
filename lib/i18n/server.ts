import { cache } from "react";
import { cookies, headers } from "next/headers";
import type { Strings } from "@/lib/strings";
import { resolveStrings } from "@/lib/i18n/resolve";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  localeFromAcceptLanguage,
  type Locale,
} from "@/lib/i18n/locales";

/**
 * The request's language, and the string table that goes with it.
 *
 * Server components call `getStrings()` instead of importing `strings`
 * directly. Client components read the same table out of `LocaleProvider`,
 * which the root layout fills from here — so there is exactly one place a
 * language is decided per request, and the client can never disagree with the
 * server about which one it is (a mismatch would hydrate as a flash of the
 * wrong language).
 *
 * Wrapped in React's `cache()` so the cookie is read once per request no
 * matter how many components ask.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const store = await cookies();
  const chosen = store.get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;

  // No cookie yet — a first arrival, usually from a link shared in WhatsApp.
  // The browser's own preference order is a better first guess than English,
  // and the switcher is there to overrule it.
  const header = (await headers()).get("accept-language");
  return localeFromAcceptLanguage(header) ?? DEFAULT_LOCALE;
});

export const getStrings = cache(async (): Promise<Strings> => {
  return resolveStrings(await getLocale());
});
