import { DISPLAY_TIME_ZONE } from "@/lib/format";
import { strings, type Strings } from "@/lib/strings";

/**
 * The day-picker strip above the games list (§5.5, REQ-GAME-021).
 *
 * A week of pickup football is a handful of days, not a calendar — so the
 * whole navigation is `Today 1 · Sat 2 · Sun 3`, and the count is part of it:
 * a day tab that turns out to hold nothing is a tap wasted, and on a phone
 * that is the whole interaction.
 *
 * DAYS ARE PRAGUE CALENDAR DAYS, not UTC ones and not the viewer's. A 21:30
 * game on the 3rd is 19:30Z, which is still the 3rd in Prague and would be the
 * 3rd in London too — but a 00:30 game would not be, and the product's whole
 * notion of "which evening is this" is the pitch's, not the reader's. Same
 * reasoning as `lib/format.ts`: the zone is passed explicitly on every call,
 * because a formatter falling back to the host zone looks right in local dev
 * and renders wrong on Vercel.
 *
 * Pure functions over an explicit `now`, so nothing here reads the clock — the
 * caller owns that, and the query layer is already reading it per request.
 */

/** `2026-08-03` in Prague, whatever instant is handed in. */
export function pragueDayKey(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`Invalid datetime value: ${String(value)}`);
  }
  // `en-CA` yields ISO-ordered `YYYY-MM-DD`, which sorts lexicographically —
  // the property this key exists for. Building it from parts by hand would be
  // the same thing with more ways to get the padding wrong.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export interface DayTab {
  /** `2026-08-03` — the value carried in the URL. */
  key: string;
  /** "Today" / "Tomorrow" / "Sat" — what the tab reads. */
  label: string;
  /** How many games fall on this day. Never zero: empty days get no tab. */
  count: number;
}

/**
 * One tab per day that actually has a game, in kick-off order.
 *
 * EMPTY DAYS GET NO TAB. The strip describes what is on, not what a week
 * contains — a "Thu 0" tab is a control whose only outcome is disappointment.
 */
export function buildDayTabs(
  startsAtList: (Date | string | number)[],
  now: Date | string | number,
  t: Strings = strings,
): DayTab[] {
  const counts = new Map<string, number>();
  for (const startsAt of startsAtList) {
    const key = pragueDayKey(startsAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const today = pragueDayKey(now);
  const tomorrow = pragueDayKey(
    new Date((now instanceof Date ? now : new Date(now)).getTime() + 24 * 3600_000),
  );

  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => ({ key, label: dayLabel(key, today, tomorrow, t), count }));
}

/**
 * "Today", "Tomorrow", or a short weekday.
 *
 * The two relative labels are worth the special case: they are the two days
 * anyone opening this page is most likely to be deciding between, and "Sun"
 * on a Sunday makes a reader do arithmetic to work out it means now.
 *
 * The weekday is derived from midday UTC on that date rather than midnight,
 * so no timezone offset can push the label onto the neighbouring day. Midnight
 * is exactly where that goes wrong.
 */
function dayLabel(key: string, today: string, tomorrow: string, t: Strings): string {
  if (key === today) return t.games.dayToday;
  if (key === tomorrow) return t.games.dayTomorrow;

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DISPLAY_TIME_ZONE,
    weekday: "short",
  }).format(new Date(`${key}T12:00:00Z`));
}

/**
 * The day to show when the URL names one, or asks for something with no games.
 *
 * FALLS BACK TO THE FIRST TAB rather than to an empty list. A stale link — a
 * game shared on Friday and opened on Monday — otherwise lands on a page that
 * looks broken, and the reader has no way to know the day simply passed.
 */
export function resolveSelectedDay(
  requested: string | undefined,
  tabs: DayTab[],
): string | null {
  if (tabs.length === 0) return null;
  if (requested && tabs.some((tab) => tab.key === requested)) return requested;
  return tabs[0].key;
}
