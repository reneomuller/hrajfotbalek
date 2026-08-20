import type { Locale } from "@/lib/i18n/locales";
import { DATE_LOCALE } from "@/lib/games/days";
import { statLabel, type StatKey } from "@/lib/profile/statLabel";
import type { ProfileStats as Stats } from "@/lib/profile/stats";
import type { Strings } from "@/lib/strings";

/**
 * The three-up stat row under the identity.
 *
 * ALL THREE ARE DERIVABLE TODAY, which is why all three render — the owner's
 * instruction was to drop any that were not and say which. Games played and
 * pitches played are counts over the player's own bookings; hours resolves
 * null durations through `policy.game.durationMinutes` rather than summing them
 * as zero, which would report a regular's history an hour short per game while
 * staying perfectly plausible.
 *
 * NUMBERS ARE LOCALISED, and this is not decoration: Czech and Russian both
 * write a decimal COMMA, so `12.5` hours renders as `12,5` for a reader whose
 * banking app, phone and everything else agrees on the comma. The count of
 * games is run through the same formatter for consistency, which also gets
 * thousands separators right if anyone ever plays that much football.
 *
 * ZERO IS RENDERED, NOT HIDDEN. A new player sees three zeroes, and that is the
 * point — the badge grid below is a ladder, and a ladder needs a bottom rung
 * you can see yourself standing on. Hiding empty stats would leave the
 * emptiest profile with the least to look at.
 */
export function ProfileStats({
  stats,
  locale,
  t,
}: {
  stats: Stats;
  locale: Locale;
  t: Strings;
}) {
  const format = new Intl.NumberFormat(DATE_LOCALE[locale], {
    maximumFractionDigits: 1,
  });

  const cells: { key: StatKey; value: number }[] = [
    { key: "games", value: stats.gamesPlayed },
    { key: "hours", value: stats.hours },
    { key: "venues", value: stats.venues },
  ];

  return (
    /*
      `mt-7`, not `mt-6`. The identity block above ends on a 13px meta line and
      this row opens on a 30px numeral; equal margins around unequal type read
      as unequal, and the strip showed the figures crowding the name they
      belong under rather than starting a new band of the page.
    */
    <section data-testid="profile-stats" className="mt-7 grid grid-cols-3 gap-3">
      {cells.map((cell) => (
        <div key={cell.key} data-testid={`profile-stat-${cell.key}`}>
          <div
            data-testid={`profile-stat-${cell.key}-value`}
            className="font-display text-[30px] leading-none text-white"
          >
            {format.format(cell.value)}
          </div>
          {/*
            `leading-tight` and no truncation. "hours on pitch" wraps to two
            lines in English and "odehraných zápasů" wraps in Czech; a fixed
            single line here would clip a label rather than wrap it, and §2.13's
            rule against truncating the things a reader scans for applies to a
            stat's own name as much as to a game's.
          */}
          {/* TRACKED CAPS (p10), which is the same `eyebrow` treatment the
              home page's two community figures already use — these are the
              same object on a different surface, and they were reading as two
              different components. */}
          <div className="mt-[6px] text-eyebrow font-semibold uppercase leading-tight text-muted">
            {statLabel(cell.key, cell.value, locale, t)}
          </div>
        </div>
      ))}
    </section>
  );
}
