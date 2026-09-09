/**
 * Datetime formatting for display.
 *
 * Every user-visible datetime renders in `Europe/Prague` on a 24-hour clock.
 * Raw UTC must never reach a surface. The timezone is passed explicitly on
 * every call rather than relying on the host default — a formatter that falls
 * back to the host zone looks correct in local dev and renders wrong on
 * Vercel (UTC), which is exactly the bug this module exists to prevent.
 */

export const DISPLAY_TIME_ZONE = "Europe/Prague";

/**
 * THE ONE PLACE A LANGUAGE BECOMES A DATE CONVENTION (round 28, item 9).
 *
 * ~~`const DISPLAY_LOCALE = "en-GB"`~~ was hardcoded here and read by every
 * function below, which is audit finding F2 (ledger row 154): a Czech player
 * read `Út 25 srp` on the day strip — which localises properly — and
 * `Tue 25 Aug` four pixels underneath it, from this file.
 *
 * `en` MAPS TO `en-GB`, NOT TO BARE `en`. Bare `en` resolves to US
 * conventions and puts the month first — `Aug 3` — and the games are in
 * Prague, where every reader of the English UI reads European dates on
 * everything else on their phone. Czech, Russian and Ukrainian are bare tags:
 * each has one region and no second convention to disagree with.
 *
 * THE PARAMETER IS OPTIONAL AND DEFAULTS TO ENGLISH, deliberately. This round
 * localises the surfaces the owner named — the games list's WHEN headers and
 * the game detail — and there are more call sites than that. A required
 * parameter would have forced a mechanical edit of all of them in one commit,
 * which is how a display change becomes a diff nobody can review. The
 * remainder is ledger row 208, listed rather than half-done in silence.
 */
export const DATE_LOCALE = {
  en: "en-GB",
  cs: "cs",
  ru: "ru",
  uk: "uk",
} as const satisfies Record<string, string>;

/** A UI language, or a BCP-47 tag already resolved. */
export type DateLocale = keyof typeof DATE_LOCALE;

function tagFor(locale?: DateLocale): string {
  return locale ? DATE_LOCALE[locale] : DATE_LOCALE.en;
}

function toDate(value: Date | string | number): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`Invalid datetime value: ${String(value)}`);
  }
  return date;
}

/** e.g. "Thu 18:30" — the primary game-time rendering. */
export function formatGameTime(value: Date | string | number, locale?: DateLocale): string {
  const parts = new Intl.DateTimeFormat(tagFor(locale), {
    timeZone: DISPLAY_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(toDate(value));

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "";
  return `${weekday} ${hour}:${minute}`;
}

/** e.g. "Thu 3 Jul 18:30" — used where the date is not implied by context. */
export function formatGameDateTime(value: Date | string | number, locale?: DateLocale): string {
  const parts = new Intl.DateTimeFormat(tagFor(locale), {
    timeZone: DISPLAY_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(toDate(value));

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return `${get("weekday")} ${get("day")} ${get("month")} ${get("hour")}:${get("minute")}`;
}

/**
 * e.g. "Thu 3 Jul 19:30–20:30" — the time SPAN, which is what the contract
 * asks cards and the detail page to render (§5.2, REQ-GAME-007).
 *
 * The dash is an EN DASH (U+2013), not a hyphen: it is a range, and a hyphen
 * between two clock times reads as a compound word at small sizes on a phone.
 *
 * The end time is formatted through the same `Europe/Prague` formatter as the
 * start, so a game that runs across the DST boundary prints the wall-clock
 * times a player would actually see on the pitch rather than start + duration
 * arithmetic done in UTC.
 */
export function formatGameTimeSpan(
  startsAt: Date | string | number,
  endsAt: Date | string | number,
  locale?: DateLocale,
): string {
  return `${formatGameDateTime(startsAt, locale)}–${formatTime(endsAt, locale)}`;
}

/** e.g. "19:30–20:30" — the span alone, where the date is already implied. */
export function formatTimeSpan(
  startsAt: Date | string | number,
  endsAt: Date | string | number,
  locale?: DateLocale,
): string {
  return `${formatTime(startsAt, locale)}–${formatTime(endsAt, locale)}`;
}

/**
 * e.g. "Thu 3 Jul" — the game's DAY, with no time and no year.
 *
 * The weekday is the part a player reads first — "which evening is this" — and
 * the year is noise on a page that only ever shows games in the next few weeks.
 * Distinct from `formatDate`, which carries the year and drops the weekday
 * because it is used on receipts and ledger rows, where the opposite is true.
 */
export function formatGameDate(value: Date | string | number, locale?: DateLocale): string {
  const parts = new Intl.DateTimeFormat(tagFor(locale), {
    timeZone: DISPLAY_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(toDate(value));

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return `${get("weekday")} ${get("day")} ${get("month")}`;
}

/** e.g. "3 Jul 2026" — date only. */
export function formatDate(value: Date | string | number, locale?: DateLocale): string {
  return new Intl.DateTimeFormat(tagFor(locale), {
    timeZone: DISPLAY_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(toDate(value));
}

/** e.g. "18:30" — time only, 24h. */
export function formatTime(value: Date | string | number, locale?: DateLocale): string {
  return new Intl.DateTimeFormat(tagFor(locale), {
    timeZone: DISPLAY_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(toDate(value));
}

/** Money is rendered as whole crowns — the schema stores integer CZK. */
export function formatCzk(amountCzk: number): string {
  /*
   * MONEY DOES NOT FOLLOW THE UI LANGUAGE, and that is CLAUDE.md's rule rather
   * than an oversight: the player is about to open a Czech banking app and the
   * figure has to match what it shows. `en-GB` grouping is what every previous
   * round rendered and what the QR payment line carries.
   */
  return `${Math.round(amountCzk).toLocaleString(DATE_LOCALE.en)} CZK`;
}
