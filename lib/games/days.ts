import { DISPLAY_TIME_ZONE } from "@/lib/format";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
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
  /** "SAT" — the weekday, abbreviated, for the calendar cell's top line. */
  weekday: string;
  /** "15" — the day of the month, for the cell's second line. */
  dayOfMonth: string;
  /** How many games fall on this day. ZERO IS NORMAL — every day gets a tab. */
  count: number;
}

/**
 * The row is TODAY PLUS THE NEXT SEVEN — eight cells, always, rolling.
 *
 * Inclusive of today + 7 so the row spans a full week AND its same-weekday
 * bookend: opening on a Tuesday shows through the following Tuesday, which is
 * how someone thinking "next Tuesday" finds it without leaving the row.
 */
export const DAY_TAB_DAYS = 8;

/**
 * A FIXED WEEK OF TABS: today through today + 7 inclusive, whether or not a
 * day has games.
 *
 * AMENDMENT A, 2026-08-10. The restored control emitted one tab per day that
 * HAD games, which was faithful to `ed9997c` and wrong in practice: on a quiet
 * board it collapsed to three tabs and read as broken — a row that changes
 * width with the schedule looks like a rendering fault rather than a filter.
 *
 * A fixed week is not the eight-box strip returning. That control was the ONLY
 * way to reach a day, so its window truncated the product; this one sits above
 * an `All` view that is unbounded, so a game months out is still on the first
 * load. The week is a convenience for the days people are actually choosing
 * between, and nothing is reachable only through it.
 *
 * AN EMPTY DAY IS STILL A TAB and still a link — tapping it shows the list's
 * empty state, which is a real answer ("nothing on Thursday") rather than a
 * dead control. That reverses the rest-day treatment of `d488826`, where an
 * empty day was drawn but not focusable.
 */
export function buildDayTabs(
  startsAtList: (Date | string | number)[],
  now: Date | string | number,
  locale: Locale = DEFAULT_LOCALE,
  days: number = DAY_TAB_DAYS,
): DayTab[] {
  const counts = new Map<string, number>();
  for (const startsAt of startsAtList) {
    const key = pragueDayKey(startsAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const today = pragueDayKey(now);

  return Array.from({ length: days }, (_, offset) => {
    const key = addDays(today, offset);
    return {
      key,
      weekday: weekdayLabel(key, locale),
      dayOfMonth: String(Number(key.slice(8, 10))),
      count: counts.get(key) ?? 0,
    };
  });
}

/**
 * `key` plus `n` calendar days, as another Prague day key.
 *
 * VIA MIDDAY UTC, never by adding 86,400,000 milliseconds to a midnight.
 * Prague has a 23-hour day and a 25-hour day every year, and a row built by
 * adding fixed days across the March transition either repeats a date or skips
 * one. Midday is the furthest any instant can be from a Prague midnight.
 */
function addDays(key: string, n: number): string {
  return pragueDayKey(new Date(Date.parse(`${key}T12:00:00Z`) + n * 86_400_000));
}

/**
 * "SAT" — abbreviated and UPPER, in the reader's language.
 *
 * RULING B DOES NOT REACH INSIDE THE CELL, by the owner's amendment: a
 * calendar cell is data display, not a heading, and the abbreviation style is
 * the original's. `eyebrow` remains the only uppercase style in prose.
 *
 * Localised, which the `ed9997c` original was not — that hardcoded `en-GB` and
 * printed `Sat` on a Czech page. The look is the ruling; the language bug is
 * not.
 */
function weekdayLabel(key: string, locale: Locale): string {
  return new Intl.DateTimeFormat(DATE_LOCALE[locale], {
    timeZone: DISPLAY_TIME_ZONE,
    weekday: "short",
  })
    .format(new Date(`${key}T12:00:00Z`))
    .toLocaleUpperCase(locale);
}

/**
 * The BCP-47 tag each of the product's three languages formats DATES with.
 *
 * `en` maps to `en-GB`, not to bare `en`. Bare `en` resolves to US
 * conventions, which puts the month first — `Mon, Aug 3` — and the games are
 * in Prague, where every reader of the English UI is reading European dates
 * everywhere else on their phone. This is a display convention, not a
 * language: `cs` and `ru` need no region because neither has a second one that
 * disagrees about date order.
 */
const DATE_LOCALE: Record<Locale, string> = {
  en: "en-GB",
  cs: "cs",
  ru: "ru",
};

/**
 * First letter upper-cased, the rest left alone.
 *
 * `Intl` yields lower-case weekday and month names for Czech and Russian
 * (`st`, `ср`) because that is how they are written inside a sentence. In a
 * calendar box they are not inside a sentence — they are a label — and a box
 * reading `st` looks like a truncation rather than a Wednesday. Ruling B's
 * sentence case is exactly this: not lower, not tracked capitals.
 *
 * `toLocaleUpperCase` rather than `toUpperCase`, because the two disagree for
 * some scripts and there is no reason to be wrong for free.
 */
function capitalise(value: string, locale: Locale): string {
  return value.charAt(0).toLocaleUpperCase(locale) + value.slice(1);
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
  locale: Locale = DEFAULT_LOCALE,
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
      label: dayHeading(key, today, tomorrow, t, locale),
      items: group,
    }));
}

/**
 * "Today · Sat 8 Aug" / "Dnes · so 8. 8." — in the reader's language.
 *
 * Same defect as the weekday on the strip and fixed with it: `Today` and
 * `Tomorrow` came through the string table and were translated, while the date
 * beside them was formatted `en-GB`, so a Czech heading read `Dnes · Sat 8
 * Aug`. Half-translated is worse than untranslated — it reads as a bug in the
 * page rather than as a language the product does not speak.
 */
function dayHeading(
  key: string,
  today: string,
  tomorrow: string,
  t: Strings,
  locale: Locale,
): string {
  const date = new Date(`${key}T12:00:00Z`);
  const full = capitalise(
    new Intl.DateTimeFormat(DATE_LOCALE[locale], {
      timeZone: DISPLAY_TIME_ZONE,
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(date),
    locale,
  );

  if (key === today) return `${t.games.dayToday} · ${full}`;
  if (key === tomorrow) return `${t.games.dayTomorrow} · ${full}`;
  return full;
}
