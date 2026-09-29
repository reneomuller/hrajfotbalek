import type { IconName } from "@/components/Icon";
import type { Strings } from "@/lib/strings";
import type { ProfileStats } from "@/lib/profile/stats";

/**
 * The badge ladder — six badges over the three profile stats and players met.
 *
 * DERIVED FROM EXISTING DATA ONLY, and that is the whole design of this round.
 * No `badges` table, no `player_badges` join, no awarding job, no rules engine:
 * a badge is a THRESHOLD ON A NUMBER THE PROFILE ALREADY COMPUTES, evaluated at
 * render time. Which means there is no state to get out of sync, nothing to
 * backfill for players who qualified before the feature existed, and no
 * migration — SCOPE.md's front-end rule holds.
 *
 * The cost is honest and worth naming: a badge cannot record WHEN it was
 * earned, and it can be un-earned if the underlying booking is cancelled. Both
 * are acceptable for a starter set and both are the first thing a real badges
 * table would fix.
 *
 * LOCKED BADGES ARE RENDERED, NOT HIDDEN. That is the motivation mechanic and
 * it is the reason the requirement text is a first-class field rather than a
 * tooltip: a grid showing only what you have earned tells a new player they
 * have nothing, while a grid showing five greyed rows with "5 games played"
 * under them tells them what to do next. A locked badge whose requirement is
 * invisible is just a grey box.
 *
 * THE THRESHOLDS ARE A LADDER, not a set of nice round numbers. 1 / 5 / 20 on
 * games is first-time, habit, regular; 3 venues and 10 hours are the two
 * sideways axes, so somebody who plays the same pitch every week and somebody
 * who plays everywhere both have something ahead of them.
 */

export type BadgeKey =
  | "firstGame"
  | "regular"
  | "veteran"
  | "explorer"
  | "ironLegs"
  | "teamPlayer";

/**
 * What the ladder reads: the three booking-derived stats, plus players met.
 *
 * `playersMet` is NULL, NOT ZERO, when the database cannot count it — the same
 * convention `ProfileStats`' third tile uses. A null leaves Team player locked,
 * which is the truthful reading of "we do not know".
 */
export interface BadgeStats extends ProfileStats {
  playersMet: number | null;
}

export interface Badge {
  key: BadgeKey;
  icon: IconName;
  name: string;
  /** What it takes — shown on locked AND earned, so the grid reads uniformly. */
  requirement: string;
  earned: boolean;
}

/**
 * The thresholds, as one table.
 *
 * Exported because the tests assert against it rather than restating the
 * numbers — a test that hardcodes `5` passes happily after the threshold moves
 * to 6, which makes it a test of nothing.
 */
export const BADGE_THRESHOLDS = {
  firstGame: 1,
  regular: 5,
  veteran: 20,
  explorer: 3,
  ironLegs: 10,
  teamPlayer: 50,
} as const;

/**
 * ICONS COME FROM THE EXISTING SET (`components/Icon.tsx`) — no new art this
 * round, per the owner's ruling. They are assigned by what the badge MEASURES
 * rather than by mood, which is what keeps the glyphs from reading as
 * decoration: `balls` and `calendar` and `medal` are the games ladder (a first
 * football, then turning up week after week, then long service), `pin` is the
 * venue count, `users` is the people met.
 *
 * ~~`clock` is the hours~~ — Iron legs takes `boot` (owner's request, round
 * 38): a clock said "time", and the badge is about legs. ~~`list`~~ — Veteran
 * takes `medal` in the same round: a checklist read as a to-do, not a record.
 */
export function playerBadges(stats: BadgeStats, t: Strings): Badge[] {
  const { badges } = t.profile;

  return [
    {
      key: "firstGame",
      icon: "balls",
      name: badges.firstGame,
      requirement: badges.firstGameHint,
      earned: stats.gamesPlayed >= BADGE_THRESHOLDS.firstGame,
    },
    {
      key: "regular",
      icon: "calendar",
      name: badges.regular,
      requirement: badges.regularHint,
      earned: stats.gamesPlayed >= BADGE_THRESHOLDS.regular,
    },
    {
      key: "veteran",
      icon: "medal",
      name: badges.veteran,
      requirement: badges.veteranHint,
      earned: stats.gamesPlayed >= BADGE_THRESHOLDS.veteran,
    },
    {
      key: "explorer",
      icon: "pin",
      name: badges.explorer,
      requirement: badges.explorerHint,
      earned: stats.venues >= BADGE_THRESHOLDS.explorer,
    },
    {
      key: "ironLegs",
      icon: "boot",
      name: badges.ironLegs,
      requirement: badges.ironLegsHint,
      earned: stats.hours >= BADGE_THRESHOLDS.ironLegs,
    },
    {
      key: "teamPlayer",
      icon: "users",
      name: badges.teamPlayer,
      requirement: badges.teamPlayerHint,
      earned: stats.playersMet !== null && stats.playersMet >= BADGE_THRESHOLDS.teamPlayer,
    },
  ];
}

/** How many are earned — the `0 of 6` counter beside the heading. */
export function earnedCount(badges: Badge[]): number {
  return badges.filter((badge) => badge.earned).length;
}
