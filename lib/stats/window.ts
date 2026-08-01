import { DISPLAY_TIME_ZONE } from "@/lib/format";

/**
 * The day / week / month filter every metric is bounded by (REQ-ADMIN-006).
 *
 * WINDOWS ARE PRAGUE CALENDAR WINDOWS, not rolling 24-hour spans and not UTC
 * ones. "This week" to the person reading this page means the week the games
 * were played in, and the games are in Prague. A rolling window would also
 * make the number move continuously, so two people looking at the same page
 * ten minutes apart would compare different figures and conclude something had
 * happened.
 *
 * WEEKS START ON MONDAY. Czech convention, and — more usefully — it puts a
 * Saturday and a Sunday fixture in the same week, which is how a pickup
 * football weekend is actually counted.
 *
 * Pure functions over an explicit `now`, so nothing here reads the clock: the
 * page reads it once and hands it down, and the lint rule that forbids
 * `Date.now()` during render is enforcing a real property.
 */

export const STAT_WINDOWS = ["day", "week", "month"] as const;
export type StatWindow = (typeof STAT_WINDOWS)[number];

export const DEFAULT_STAT_WINDOW: StatWindow = "week";

export function isStatWindow(value: unknown): value is StatWindow {
  return typeof value === "string" && (STAT_WINDOWS as readonly string[]).includes(value);
}

export interface StatRange {
  window: StatWindow;
  /** Inclusive lower bound, as an ISO instant. */
  from: string;
  /** EXCLUSIVE upper bound, as an ISO instant. */
  to: string;
}

/**
 * The Prague wall-clock parts of an instant.
 *
 * Read through `Intl` rather than by adding an offset, because the offset is
 * not a constant — Prague is UTC+1 or UTC+2 depending on the date, and doing
 * this arithmetically is how a window silently shifts by an hour twice a year.
 */
function pragueParts(at: Date): {
  year: number;
  month: number;
  day: number;
  weekday: number;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(at);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    // 0 = Monday, matching the week start.
    weekday: Math.max(0, weekdays.indexOf(get("weekday"))),
  };
}

/**
 * Midnight at the start of a Prague calendar date, as an absolute instant.
 *
 * SOLVED BY SEARCH RATHER THAN BY ARITHMETIC. There is no way to construct
 * "midnight in Prague" directly from JavaScript's `Date`, and adding a fixed
 * offset breaks across DST. So this takes the UTC midnight for the date and
 * corrects it by whatever offset Prague was actually on at that moment,
 * measured through `Intl` — which is right on both sides of both transitions.
 */
function pragueMidnight(year: number, month: number, day: number): Date {
  const naive = Date.UTC(year, month - 1, day, 0, 0, 0, 0);

  // Two passes. The first correction can itself land on the other side of a
  // transition; the second settles it. A third would never differ, because
  // offsets move by at most an hour and the first pass is already within one.
  let instant = new Date(naive);
  for (let pass = 0; pass < 2; pass += 1) {
    const offsetMs = pragueOffsetMs(instant);
    instant = new Date(naive - offsetMs);
  }
  return instant;
}

/** How far ahead of UTC Prague was at a given instant, in milliseconds. */
function pragueOffsetMs(at: Date): number {
  // `en-CA` + `hour12: false` yields "2026-08-02, 24:00:00" style output that
  // parses cleanly as if it were UTC; the difference from the real instant is
  // the offset.
  const asPrague = new Date(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: DISPLAY_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .format(at)
      .replace(",", "")
      .replace(/(\d{4}-\d{2}-\d{2}) (\d{2})/, "$1T$2") + "Z",
  );
  return asPrague.getTime() - at.getTime();
}

/**
 * The bounds for a window, containing `now`.
 *
 * The upper bound is EXCLUSIVE and is the start of the NEXT period rather than
 * `now`. Two reasons: a metric bounded at `now` changes every time the page is
 * refreshed, and a game kicking off later today belongs to today — excluding
 * it because the clock has not reached it yet would make "games this week"
 * disagree with the list of games this week.
 */
export function statRange(window: StatWindow, now: Date | number): StatRange {
  const at = now instanceof Date ? now : new Date(now);
  const { year, month, day, weekday } = pragueParts(at);

  if (window === "day") {
    const from = pragueMidnight(year, month, day);
    const to = pragueMidnight(year, month, day + 1);
    return { window, from: from.toISOString(), to: to.toISOString() };
  }

  if (window === "week") {
    const from = pragueMidnight(year, month, day - weekday);
    const to = pragueMidnight(year, month, day - weekday + 7);
    return { window, from: from.toISOString(), to: to.toISOString() };
  }

  const from = pragueMidnight(year, month, 1);
  const to = pragueMidnight(year, month + 1, 1);
  return { window, from: from.toISOString(), to: to.toISOString() };
}

/** Reads the filter out of a `searchParams` bag, falling back to the default. */
export function readStatWindow(
  query: Record<string, string | string[] | undefined>,
): StatWindow {
  const raw = query.window;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return isStatWindow(value) ? value : DEFAULT_STAT_WINDOW;
}
