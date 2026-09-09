import { CountryFlag } from "@/components/flags/CountryFlag";
import { countryName } from "@/lib/auth/countries";
import { POSITIONS, type Position } from "@/lib/players/positions";
import type { Locale } from "@/lib/i18n/locales";
import type { Strings } from "@/lib/strings";

/**
 * Country, preferred position and level, on a stranger's profile
 * (round 28, item 4 — the owner's amendment to round 14's scope).
 *
 * WHAT MAKES THIS IN SCOPE where an email address is not: all three are facts
 * a player states about their FOOTBALL, on a page that exists to answer "who
 * is this in the lineup". Round 14 drew the boundary at identity and contact,
 * and that half is untouched — no email, no phone, no join date.
 *
 * AN UNSET FIELD RENDERS NOTHING AT ALL. Not "Not set", not a grey dash, not a
 * placeholder flag. The own-profile page shows `notSet` because it is a form
 * and the reader can fix it; here the reader is a stranger who cannot, so the
 * row would be a fact about our database rather than about the player. A
 * profile with none of the three set renders no block, not an empty card.
 *
 * THE FLAG IS DECORATION AND THE NAME IS THE CONTENT. `CountryFlag` returns
 * null for the 245 countries with no drawing, so the row degrades to the
 * country's name alone — see that file for why emoji were not an option.
 */
export function PublicFacts({
  country,
  skillLevel,
  positions,
  locale,
  t,
}: {
  country: string | null;
  skillLevel: string | null;
  positions: string[];
  locale: Locale;
  t: Strings;
}) {
  const known = positions.filter((p): p is Position =>
    (POSITIONS as readonly string[]).includes(p),
  );

  const skillLabel =
    skillLevel === "beginner"
      ? t.auth.skillBeginner
      : skillLevel === "intermediate"
        ? t.auth.skillIntermediate
        : skillLevel === "advanced"
          ? t.auth.skillAdvanced
          : null;

  const rows: { key: string; label: string; value: React.ReactNode }[] = [];

  if (country) {
    rows.push({
      key: "country",
      label: t.profile.nationality,
      value: (
        <span className="flex items-center gap-2">
          <CountryFlag code={country} width={18} />
          <span>{countryName(country, locale)}</span>
        </span>
      ),
    });
  }

  if (known.length > 0) {
    rows.push({
      key: "positions",
      label: t.profile.position,
      value: known.map((p) => t.profile.positions[p]).join(" · "),
    });
  }

  if (skillLabel) {
    rows.push({ key: "skill", label: t.profile.skillLevel, value: skillLabel });
  }

  if (rows.length === 0) return null;

  return (
    <section data-testid="public-facts" className="mt-4 rounded-card bg-surface p-5">
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3">
        {rows.map((row) => (
          <div key={row.key} className="contents">
            <dt
              data-testid={`public-fact-${row.key}`}
              className="m-0 pt-[2px] text-[10px] uppercase tracking-eyebrow text-muted"
            >
              {row.label}
            </dt>
            <dd className="m-0 text-body text-bone">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
