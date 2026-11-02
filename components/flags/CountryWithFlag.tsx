import { CountryFlag } from "@/components/flags/CountryFlag";
import { countryName } from "@/lib/auth/countries";
import type { Locale } from "@/lib/i18n/locales";

/**
 * A country's flag and its name, on one muted line — under a player's name on
 * their public profile (2026-11-02, the owner's request).
 *
 * The `compact` circle, the size drawn for 12–13px type, and the same line
 * your own profile's `ProfileMeta` draws minus the join date — which the
 * public profile's scope excludes (see `PublicIdentity`). The flag sits
 * outside the truncating span, so a long name clips its text, never the flag.
 *
 * Renders nothing for an unset or unknown country: no placeholder flag, no
 * "Not set" — the reader is a stranger who cannot fix it.
 */
export function CountryWithFlag({
  country,
  locale,
}: {
  /** ISO 3166-1 alpha-2, or null when unset. */
  country: string | null;
  locale: Locale;
}) {
  const name = countryName(country, locale);
  if (!name) return null;

  return (
    <p data-testid="public-country" className="m-0 flex min-w-0 items-center gap-1.5 text-small text-muted">
      <CountryFlag code={country} size="compact" />
      <span className="truncate">{name}</span>
    </p>
  );
}
