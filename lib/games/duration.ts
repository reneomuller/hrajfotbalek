import { policy } from "@/lib/policy";

/**
 * How long a game runs, and when it ends.
 *
 * ONE FALLBACK, ONE PLACE. `games.duration_minutes` is nullable (migration 26)
 * and null means "not stated", which renders as `policy.game.durationMinutes`.
 * Four surfaces need that answer — the card, the detail page, the `.ics`
 * `DTEND` and the schema.org `endDate` — and a render site left on the raw
 * constant produces a game whose calendar entry disagrees with its own page
 * (contract §5.2). That is the failure this module exists to make impossible:
 * every one of them calls `resolveDurationMinutes`, and none of them reads the
 * policy value directly.
 *
 * DISPLAY ONLY. Nothing transitions on a duration — no RPC, no sweep, no state
 * change consults it — so this is not a policy window in the v2.5 §5 sense and
 * `POLICY_VERSION` does not move for it.
 */

/** The per-game value, or the standard length when the organizer said nothing. */
export function resolveDurationMinutes(durationMinutes: number | null | undefined): number {
  return durationMinutes ?? policy.game.durationMinutes;
}

/** When a game ends, as an absolute instant. */
export function gameEndsAt(
  startsAt: Date | string | number,
  durationMinutes: number | null | undefined,
): Date {
  const start = startsAt instanceof Date ? startsAt : new Date(startsAt);
  if (Number.isNaN(start.getTime())) {
    throw new TypeError(`Invalid datetime value: ${String(startsAt)}`);
  }
  return new Date(start.getTime() + resolveDurationMinutes(durationMinutes) * 60_000);
}

/**
 * Whether a game is being played right now — kicked off, not yet finished.
 *
 * The site the contract calls "the in-progress label wherever a game's end
 * time is inferred". `hasStarted` alone cannot answer it: a game that kicked
 * off two hours ago and one that kicked off ten minutes ago are the same
 * boolean and very different sentences to put on a page.
 *
 * `now` is passed in rather than read here so the caller owns the clock — the
 * query layer already runs per request, and reading the clock during render is
 * how a server-rendered page and its hydration disagree.
 */
export function isInProgress(
  startsAt: Date | string | number,
  durationMinutes: number | null | undefined,
  now: number,
): boolean {
  const start = startsAt instanceof Date ? startsAt : new Date(startsAt);
  if (Number.isNaN(start.getTime())) return false;
  return now >= start.getTime() && now < gameEndsAt(start, durationMinutes).getTime();
}

/**
 * The longest a game may run — `games_duration_range` (30–180) in SQL. A list
 * that keeps games until their final whistle looks back this far for games
 * that kicked off but may still be on.
 */
export const LONGEST_GAME_MINUTES = 180;

/**
 * WHETHER THE FINAL WHISTLE HAS GONE (the owner, 2026-11-09: "the game should
 * dissapear for the user only after it has finished (a game from 18:00-19:30
 * would dissapear from view at 19:30"). The lists keep a game until this is
 * true; until then a game that has kicked off is `isInProgress`.
 */
export function hasFinished(
  startsAt: Date | string | number,
  durationMinutes: number | null | undefined,
  now: number,
): boolean {
  const start = startsAt instanceof Date ? startsAt : new Date(startsAt);
  if (Number.isNaN(start.getTime())) return false;
  return now >= gameEndsAt(start, durationMinutes).getTime();
}
