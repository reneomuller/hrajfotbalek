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
  /** "THU" — the weekday, three letters. */
  weekday: string;
  /** "22" — the day of the month, as printed. */
  dayOfMonth: string;
  /** How many games fall on this day. Zero is normal and renders as a rest day. */
  count: number;
  /** True for the day the reader is standing in. */
  isToday: boolean;
}

/** How many days the strip covers before it is extended to reach the last game. */
export const DAY_STRIP_MIN_DAYS = 14;

/**
 * A ROLLING CALENDAR STRIP: every day from today forward, with its real date.
 *
 * WHAT CHANGED AND WHY (v1.2 §5.5). The first version emitted one tab per day
 * that had a game, labelled `Today 1 · Sat 2 · Sun 3` — a weekday and a game
 * count. Two problems, and they compound:
 *
 *   - A BARE COUNT BESIDE A WEEKDAY READS AS A DATE. "Sat 2" is a Saturday the
 *     2nd to almost everyone who glances at it, and it is in fact a Saturday
 *     with two games on some other date entirely. The one number on the control
 *     meant the one thing it could not be read as.
 *   - SKIPPING EMPTY DAYS DESTROYS THE CALENDAR. With gaps closed up, "Sat" and
 *     "Sun" sat adjacent whether they were consecutive or three weeks apart, so
 *     the strip could not answer "how far out is this" at all.
 *
 * So: every day is present, in order, carrying its weekday and its day of the
 * month. The count survives as `count` but is not printed — it is what the
 * strip uses to mark which days actually have football on, which is a dot
 * rather than a numeral.
 *
 * THE WINDOW IS A FLOOR, NOT A CAP. Fourteen days by default, extended to the
 * last scheduled game whenever that is further out. A strip that stopped at day
 * fourteen would make a game on day twenty unreachable by filter — which is the
 * same class of defect as the mode-not-filter bug this control already had once.
 */
export function buildDayTabs(
  startsAtList: (Date | string | number)[],
  now: Date | string | number,
  minDays: number = DAY_STRIP_MIN_DAYS,
): DayTab[] {
  const counts = new Map<string, number>();
  for (const startsAt of startsAtList) {
    const key = pragueDayKey(startsAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const today = pragueDayKey(now);
  const lastGame = [...counts.keys()].sort().at(-1);

  const tabs: DayTab[] = [];
  for (let i = 0; i < 400; i += 1) {
    const key = addDays(today, i);
    tabs.push({
      key,
      weekday: weekdayLabel(key),
      dayOfMonth: dayOfMonthLabel(key),
      count: counts.get(key) ?? 0,
      isToday: i === 0,
    });
    // Stop once BOTH conditions are met: the floor is covered and every game
    // has a day to be filtered by. The 400 is a runaway guard, not a policy —
    // a game a year out would still get its tab.
    if (i + 1 >= minDays && (!lastGame || key >= lastGame)) break;
  }

  return tabs;
}

/**
 * `key` plus `n` calendar days, as another Prague day key.
 *
 * VIA MIDDAY UTC, never by adding 86,400,000 milliseconds to a midnight. Prague
 * has a 23-hour day and a 25-hour day every year, and a strip built by adding
 * fixed days across the March transition either repeats a date or skips one.
 * Midday is the furthest any instant can be from a Prague midnight, so no
 * offset shift can move it onto a neighbouring date.
 */
function addDays(key: string, n: number): string {
  return pragueDayKey(new Date(Date.parse(`${key}T12:00:00Z`) + n * 86_400_000));
}

/** "THU". Upper-cased at the token rather than in CSS so the width is known. */
function weekdayLabel(key: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DISPLAY_TIME_ZONE,
    weekday: "short",
  })
    .format(new Date(`${key}T12:00:00Z`))
    .toUpperCase();
}

/** "22" — no leading zero, because a calendar does not print one. */
function dayOfMonthLabel(key: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DISPLAY_TIME_ZONE,
    day: "numeric",
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
 *
 * A DAY WITH NO GAMES IS UNRECOGNISED for this purpose, even though the strip
 * now draws a chip for it. The strip covers a rolling fortnight so it can be a
 * calendar; the filter still only accepts days there is something to filter to.
 * Without this, a link shared on the day of a game and opened after it would
 * land on an empty list instead of the whole board — which is exactly the trap
 * the null default exists to prevent, arriving by a different route.
 */
export function resolveSelectedDay(
  requested: string | undefined,
  tabs: DayTab[],
): string | null {
  if (!requested) return null;
  return tabs.some((tab) => tab.key === requested && tab.count > 0) ? requested : null;
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
