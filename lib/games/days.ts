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
  /** "Today", "Tomorrow", or a short weekday, in the reader's language. */
  label: string;
  /** How many games fall on this day. Never zero — see `buildDayTabs`. */
  count: number;
}

/**
 * ONE TAB PER DAY THAT HAS GAMES, in date order, with its count.
 *
 * RESTORED FROM `ed9997c` (Design Stage 1) by the owner's ruling of
 * 2026-08-10, which reverses the eight-box calendar strip. The reason is the
 * strip's own law turned against it: a fixed eight-day window silently hid a
 * game published for late August, which is exactly the invisible truncation
 * ruling H forbade. A window cannot both be a fixed width and cover an
 * unbounded schedule.
 *
 * So the control is a FILTER OVER WHAT EXISTS rather than a calendar: every
 * day with football on it gets a tab, however far out, and `All` — the default
 * — lists all of them. Nothing is reachable only by scrolling a strip.
 *
 * EMPTY DAYS GET NO TAB, which is what makes the count meaningful: it is never
 * zero, so a tab is never a tap that leads to an empty list.
 *
 * The rolling-calendar version drew every day including rest days so the strip
 * could answer "how far away is this". That question is answered by the day
 * HEADINGS in the list itself, which carry the date, and it was never worth an
 * unreachable game.
 */
export function buildDayTabs(
  startsAtList: (Date | string | number)[],
  now: Date | string | number,
  t: Strings = strings,
  locale: Locale = DEFAULT_LOCALE,
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
    .map(([key, count]) => ({ key, label: dayLabel(key, today, tomorrow, t, locale), count }));
}

/**
 * "Today", "Tomorrow", or a short weekday.
 *
 * The two relative labels earn their special case: they are the days anyone
 * opening this page is deciding between, and "Sun" on a Sunday makes a reader
 * do arithmetic to work out it means now.
 *
 * THE WEEKDAY IS LOCALISED, which is the one thing NOT ported verbatim from
 * `ed9997c`. That version hardcoded `en-GB`, so a Czech games page read
 * `All · Dnes · Sat · Sun`. Restoring it exactly would restore a defect fixed
 * since; the shape is the ruling, the language bug is not. Flagged rather than
 * adapted silently.
 *
 * Derived from midday UTC rather than midnight, so no offset can push the
 * label onto the neighbouring day — midnight is exactly where that goes wrong.
 */
function dayLabel(
  key: string,
  today: string,
  tomorrow: string,
  t: Strings,
  locale: Locale,
): string {
  if (key === today) return t.games.dayToday;
  if (key === tomorrow) return t.games.dayTomorrow;
  return capitalise(
    new Intl.DateTimeFormat(DATE_LOCALE[locale], {
      timeZone: DISPLAY_TIME_ZONE,
      weekday: "short",
    }).format(new Date(`${key}T12:00:00Z`)),
    locale,
  );
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
