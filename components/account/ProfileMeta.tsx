import { CountryFlag } from "@/components/flags/CountryFlag";
import { countryName } from "@/lib/auth/countries";
import { DATE_LOCALE } from "@/lib/games/days";
import type { Locale } from "@/lib/i18n/locales";
import type { Strings } from "@/lib/strings";

/**
 * The line under the nickname on your own profile: flag, country, join date.
 *
 * THE FLAG LEADS (2026-11-02, the owner's request). The public profile has
 * shown a flag beside the country since round 28; this page printed the name
 * alone. It is the `compact` circle, the size drawn for 12–13px type, and it
 * sits outside the truncating span so a long country name clips its text and
 * never the flag.
 *
 * A player with neither country nor a formattable join date shows the line
 * with whatever half exists, and no line at all if neither does — a lone
 * separator under a name is worse than a missing sentence.
 */
export function ProfileMeta({
  country,
  createdAt,
  locale,
  t,
}: {
  /** ISO 3166-1 alpha-2, or null when unset. */
  country: string | null;
  createdAt: string;
  locale: Locale;
  t: Strings;
}) {
  /*
   * "Aug 2026", IN THE READER'S LANGUAGE, from `Intl` rather than from a
   * translated month table. Czech and Russian both decline month names and
   * both abbreviate differently from English; a hand-written list would be
   * three lists to maintain and one of them would be wrong.
   *
   * `DATE_LOCALE` maps `en` to `en-GB`, which is the same mapping the day
   * headings and the calendar cells use — so a profile and a fixture list
   * never disagree about what a month is called.
   *
   * An unparseable date yields null rather than "Invalid Date", which is a
   * string this product should never render.
   */
  const joined = Number.isNaN(Date.parse(createdAt))
    ? null
    : new Intl.DateTimeFormat(DATE_LOCALE[locale], {
        month: "short",
        year: "numeric",
      }).format(new Date(createdAt));

  const name = countryName(country, locale);
  const meta = [name, joined ? t.profile.memberSince.replace("{date}", joined) : null].filter(
    (part): part is string => part !== null,
  );

  if (meta.length === 0) return null;

  return (
    <p data-testid="profile-meta" className="m-0 flex min-w-0 items-center gap-1.5 text-small text-muted">
      {name && <CountryFlag code={country} size="compact" />}
      <span className="truncate">{meta.join(" · ")}</span>
    </p>
  );
}
