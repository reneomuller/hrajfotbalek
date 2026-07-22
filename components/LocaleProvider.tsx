"use client";

import { createContext, useContext } from "react";
import { strings, type Strings } from "@/lib/strings";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";

/**
 * The resolved string table, for client components.
 *
 * Server components call `getStrings()` (lib/i18n/server.ts); client
 * components cannot, because reading a cookie is a server operation. The root
 * layout resolves the table once per request and hands it down here, so both
 * sides render from the identical object and hydration cannot flash a
 * different language than the server sent.
 *
 * The whole table is serialized into the payload rather than a locale code
 * plus a client-side merge — the merge would ship every translation to every
 * visitor, which is three times the copy for no benefit.
 */
interface LocaleContextValue {
  locale: Locale;
  t: Strings;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  t: strings,
});

export function LocaleProvider({
  locale,
  t,
  children,
}: {
  locale: Locale;
  t: Strings;
  children: React.ReactNode;
}) {
  return (
    <LocaleContext.Provider value={{ locale, t }}>{children}</LocaleContext.Provider>
  );
}

/** The string table for the current request. */
export function useStrings(): Strings {
  return useContext(LocaleContext).t;
}

/** The current language code — the switcher needs it to mark the active one. */
export function useLocale(): Locale {
  return useContext(LocaleContext).locale;
}
