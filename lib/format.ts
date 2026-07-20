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
const DISPLAY_LOCALE = "en-GB";

function toDate(value: Date | string | number): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`Invalid datetime value: ${String(value)}`);
  }
  return date;
}

/** e.g. "Thu 18:30" — the primary game-time rendering. */
export function formatGameTime(value: Date | string | number): string {
  const parts = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
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
export function formatGameDateTime(value: Date | string | number): string {
  const parts = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
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

/** e.g. "3 Jul 2026" — date only. */
export function formatDate(value: Date | string | number): string {
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    timeZone: DISPLAY_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(toDate(value));
}

/** e.g. "18:30" — time only, 24h. */
export function formatTime(value: Date | string | number): string {
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    timeZone: DISPLAY_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(toDate(value));
}

/** Money is rendered as whole crowns — the schema stores integer CZK. */
export function formatCzk(amountCzk: number): string {
  return `${Math.round(amountCzk).toLocaleString(DISPLAY_LOCALE)} CZK`;
}
