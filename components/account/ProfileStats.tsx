import type { Locale } from "@/lib/i18n/locales";
import { DATE_LOCALE } from "@/lib/games/days";
import { statLabel, type StatKey } from "@/lib/profile/statLabel";
import { thirdStat, type ProfileStats as Stats } from "@/lib/profile/stats";
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
  playersMet = null,
  locale,
  t,
}: {
  stats: Stats;
  /**
   * THE THIRD TILE, WHEN THIS DATABASE CAN COUNT IT (round 23, item 1).
   *
   * `null` — the default — keeps "pitches played" exactly as it was, which is
   * what every caller does until `20260830100000_players_met` is applied. It
   * is a nullable rather than a boolean flag plus a number because those two
   * can disagree, and the disagreement renders as a confident `0 players met`
   * on the profile of a regular.
   */
  playersMet?: number | null;
  locale: Locale;
  t: Strings;
}) {
  const format = new Intl.NumberFormat(DATE_LOCALE[locale], {
    maximumFractionDigits: 1,
  });

  /*
   * PITCHES PLAYED IS STILL COUNTED, IT JUST STOPPED HAVING A TILE. The
   * Explorer badge is "play at 3 different pitches" and the grid below reads
   * `stats.venues`, so removing the number would lock a badge people have
   * earned — the tile is a display decision and the stat is not.
   */
  const cells: { key: StatKey; value: number }[] = [
    { key: "games", value: stats.gamesPlayed },
    { key: "hours", value: stats.hours },
    thirdStat(stats, playersMet),
  ];

  return (
    /*
      `mt-7`, not `mt-6`. The identity block above ends on a 13px meta line and
      this row opens on a 30px numeral; equal margins around unequal type read
      as unequal, and the strip showed the figures crowding the name they
      belong under rather than starting a new band of the page.
    */
    /*
      `relative`, FOR THE SAME REASON THE IDENTITY ROW HAS IT (round 9, item 4).

      The cover is an absolutely positioned layer behind this row, and a
      positioned element paints above its non-positioned siblings whatever the
      source order says. Without this the photograph covered the three figures
      entirely — measured, the whole band read a maximum luminance of 37, which
      is to say the numerals were not on screen at all.

      Round 6 hit the identical bug one row up, where it sliced the nickname in
      half. Extending the cover past the identity block re-created it here, and
      it is the reason the spec measures rendered pixels rather than trusting
      the gradient.
    */
    <section
      data-testid="profile-stats"
      className="relative mt-7 grid grid-cols-3 gap-3"
    >
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
          {/* TRACKED CAPS (p10), which is the same treatment the home page's
              two community figures use — these are the same object on a
              different surface, and they were reading as two components. */}
          {/* `tracking-[1.5px]`, not `eyebrow`'s 3px (round 8, item 12). At 3px
              these captions wrap onto two lines in a third of a 390px screen
              — "GAME PLAYED" over two rows — where p10 and p11 keep them on
              one. Round 6 accepted the wrap; the p14 tiles proved the fix, and
              the same override closes it here. Still ruling B's uppercase
              style, one notch tighter. */}
          <div className="mt-[6px] text-[10px] font-semibold uppercase leading-tight tracking-[1.5px] text-muted">
            {statLabel(cell.key, cell.value, locale, t)}
          </div>
        </div>
      ))}
    </section>
  );
}
