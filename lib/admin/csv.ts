/**
 * CSV, written properly once.
 *
 * WHY THIS IS NOT `rows.map(r => r.join(","))`. Every field in this product can
 * contain the thing that breaks that: venue names are admin free text and the
 * seed's own hostile fixture contains a comma, a quote and a newline; nicknames
 * are player-supplied; organizer notes are a paragraph. A naive join produces a
 * file that opens with the columns silently shifted from one row onward, and
 * nobody notices until they are reconciling payments against it.
 *
 * RFC 4180: quote a field if it contains a comma, a quote, a CR or an LF;
 * escape an embedded quote by doubling it; separate records with CRLF. That is
 * the whole standard and it is twenty lines.
 *
 * TWO THINGS BEYOND THE STANDARD, both because Excel is the reader:
 *
 *   - A UTF-8 BOM. Without it Excel on Windows reads the file as the local
 *     code page, and "Praha 3 — Pražačka" arrives as mojibake. Every other
 *     consumer ignores a BOM.
 *   - A leading apostrophe on anything Excel would read as a formula. A field
 *     beginning `=`, `+`, `-` or `@` is executed on open — CSV injection — and
 *     the values here reach a spreadsheet an organizer opens on their own
 *     machine. This is the one place the export is not a faithful copy, and it
 *     is deliberate.
 *
 * Dates are ISO-8601 UTC rather than the Prague wall-clock the pages render.
 * A CSV is a data interchange format read by a spreadsheet or a script, and an
 * unambiguous instant is worth more there than a friendly one; the page is
 * where the friendly one belongs.
 */

/** Fields Excel would evaluate rather than display. */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

function escapeField(value: unknown): string {
  if (value === null || value === undefined) return "";

  const text = value instanceof Date ? value.toISOString() : String(value);

  /*
   * A formula-shaped field is neutralised AND quoted, even when nothing about
   * it would otherwise need quoting. `'=SUM(A1)` unquoted is still a field
   * Excel parses as text-then-formula depending on the import path; quoted, it
   * is unambiguously a string. The apostrophe goes inside the quotes, which is
   * where Excel looks for it.
   */
  if (FORMULA_LEAD.test(text)) {
    return `"'${text.replaceAll('"', '""')}"`;
  }

  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

/**
 * A complete CSV document, BOM included.
 *
 * The columns are declared as a list of `{header, value}` rather than inferred
 * from object keys: inference means the file's shape is whatever the query
 * happened to select, so adding a column to a `select` silently changes an
 * export somebody reconciles against — and dropping one silently empties it.
 */
export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [columns.map((c) => escapeField(c.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeField(c.value(row))).join(","));
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

/**
 * The response an export route returns.
 *
 * `attachment` with an explicit filename, because a CSV served inline is a
 * wall of text in a browser tab rather than a file in the Downloads folder.
 * `no-store` because these are point-in-time extracts of live data and a
 * cached one is a wrong one — the same reason every admin page is dynamic.
 *
 * The filename is built from a slug and a date and is never interpolated from
 * user data: a filename reaches a `Content-Disposition` header, and a newline
 * in a header is a response-splitting bug.
 */
export function csvResponse(csv: string, slug: string, today: string): Response {
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="hrajfotbal-${slug}-${today}.csv"`,
      "cache-control": "no-store",
    },
  });
}

/** `2026-08-02` in UTC, for the filename. */
export function csvDateStamp(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
