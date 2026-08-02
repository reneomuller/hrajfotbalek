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
 * The day the URL asked for, or NULL meaning "all of them".
 *
 * NULL IS THE DEFAULT AND THE STRIP IS A FILTER, not a mode. The first version
 * of this fell back to the first tab whenever the URL named nothing, which
 * made "one day" the only state the list had — you could narrow it but never
 * widen it again, and a game two days out was invisible until you found the
 * tab. That is how a restricted game's skill badge came to look like a
 * rendering bug: the row it was on was simply not on screen.
 *
 * An unrecognised day also resolves to null rather than to the first tab. A
 * stale link — a day shared on Friday, opened on Monday — should show the
 * whole list, which is the thing the reader can actually act on, not a
 * different day they did not ask for.
 */
export function resolveSelectedDay(
  requested: string | undefined,
  tabs: DayTab[],
): string | null {
  if (!requested) return null;
  return tabs.some((tab) => tab.key === requested) ? requested : null;
}

/**
 * Games grouped under their Prague day, in kick-off order.
 *
 * The default view is EVERY upcoming game, chronological, with a heading per
 * day — a week of pickup football is a handful of days and reads perfectly
 * well as one scrolling list. The headings are what make it scannable without
 * making it modal.
 */
export function groupByDay<T>(
  items: T[],
  startsAt: (item: T) => string,
  now: Date | string | number,
  t: Strings = strings,
): { key: string; label: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = pragueDayKey(startsAt(item));
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const today = pragueDayKey(now);
  const tomorrow = pragueDayKey(
    new Date((now instanceof Date ? now : new Date(now)).getTime() + 24 * 3600_000),
  );

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, group]) => ({
      key,
      // The heading carries the DATE as well as the relative word — "Today" on
      // its own tells you nothing about which Saturday you are looking at once
      // you have scrolled past it.
      label: dayHeading(key, today, tomorrow, t),
      items: group,
    }));
}

/** "Today · 3 Aug" / "Sat 8 Aug". */
function dayHeading(key: string, today: string, tomorrow: string, t: Strings): string {
  const date = new Date(`${key}T12:00:00Z`);
  const full = new Intl.DateTimeFormat("en-GB", {
    timeZone: DISPLAY_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);

  if (key === today) return `${t.games.dayToday} · ${full}`;
  if (key === tomorrow) return `${t.games.dayTomorrow} · ${full}`;
  return full;
}
