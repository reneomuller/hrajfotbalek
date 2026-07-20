/**
 * iCalendar (.ics) generation — RFC 5545.
 *
 * Venue is admin-supplied free text and reaches three different grammars in
 * this product: HTML text, the Open Graph `content` attribute, and iCalendar
 * TEXT. Each escapes differently and none of the three helpers is
 * interchangeable with another. Getting this one wrong produces a file phones
 * silently refuse to open — no error, no calendar entry, no clue why.
 */

import { policy } from "@/lib/policy";

/** Default match length when the schema carries no end time. */
export const DEFAULT_DURATION_MINUTES = 90;

/**
 * Escapes a value for an iCalendar TEXT field (RFC 5545 §3.3.11).
 *
 * The backslash MUST be replaced first — escaping it after the others would
 * double-escape the backslashes those replacements just introduced.
 *
 * Order and set:
 *   \  ->  \\
 *   ;  ->  \;
 *   ,  ->  \,
 *   newline (CRLF or LF) -> \n
 */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Formats a date as an iCalendar UTC timestamp: `20260725T173000Z`. */
export function formatIcsDate(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`Invalid datetime value: ${String(value)}`);
  }
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/**
 * Folds a content line to 75 octets per RFC 5545 §3.1.
 *
 * Folding counts OCTETS, not characters, so the measurement is done on UTF-8
 * bytes and the split is made on a character boundary — cutting mid-sequence
 * would emit invalid UTF-8. A long venue name is the realistic way to exceed
 * 75 octets here, and an unfolded long line is another silent parse failure.
 */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  // Continuation lines start with a space, which itself costs an octet.
  let limit = 75;

  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    if (currentBytes + charBytes > limit) {
      out.push(current);
      current = char;
      currentBytes = charBytes;
      limit = 74;
    } else {
      current += char;
      currentBytes += charBytes;
    }
  }
  if (current) out.push(current);

  return out.join("\r\n ");
}

export interface IcsEventInput {
  /** Stable identifier — the game id, so re-downloading updates rather than duplicates. */
  uid: string;
  venue: string;
  startsAt: Date | string | number;
  /** Absolute URL of the game page, included so the entry links back. */
  url?: string;
  summary?: string;
  durationMinutes?: number;
  /** Injected for determinism in tests; defaults to the start time. */
  stamp?: Date | string | number;
}

/**
 * Builds a single-event VCALENDAR.
 *
 * Lines are joined with CRLF, which RFC 5545 requires — LF-only files are
 * another thing some calendar clients reject without explanation.
 */
export function buildIcsEvent({
  uid,
  venue,
  startsAt,
  url,
  summary,
  durationMinutes = DEFAULT_DURATION_MINUTES,
  stamp,
}: IcsEventInput): string {
  const start = startsAt instanceof Date ? startsAt : new Date(startsAt);
  if (Number.isNaN(start.getTime())) {
    throw new TypeError(`Invalid datetime value: ${String(startsAt)}`);
  }
  const end = new Date(start.getTime() + durationMinutes * 60_000);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//hrajfotbal//${policy.version}//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}@hrajfotbal.com`,
    `DTSTAMP:${formatIcsDate(stamp ?? start)}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(summary ?? venue)}`,
    `LOCATION:${escapeIcsText(venue)}`,
    ...(url ? [`URL:${escapeIcsText(url)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

/** Filename for the download, safe across filesystems. */
export function icsFilename(venue: string): string {
  const slug = venue
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 40);
  return `${slug || "game"}.ics`;
}
