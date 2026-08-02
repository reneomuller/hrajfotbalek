import { describe, expect, it } from "vitest";
import { csvDateStamp, toCsv, type CsvColumn } from "@/lib/admin/csv";

/**
 * The export format, tested against the values that actually break it.
 *
 * The fixtures here are not invented: `scripts/fixtures.ts` seeds a venue named
 * `<script>alert(1)</script> "Praha 2", a;b\c` precisely because it carries a
 * comma, a quote and the makings of a broken field boundary, and it is the
 * value most likely to end up in a payments export.
 */

interface Row {
  venue: string;
  amount: number | null;
}

const COLUMNS: CsvColumn<Row>[] = [
  { header: "venue", value: (r) => r.venue },
  { header: "amount", value: (r) => r.amount },
];

/** The document without its BOM, split into records. */
function records(csv: string): string[] {
  expect(csv.startsWith("﻿")).toBe(true);
  return csv.slice(1).trimEnd().split("\r\n");
}

describe("toCsv", () => {
  it("writes a header row from the declared columns", () => {
    expect(records(toCsv(COLUMNS, []))).toEqual(["venue,amount"]);
  });

  it("quotes a field containing a comma, and doubles an embedded quote", () => {
    const csv = toCsv(COLUMNS, [{ venue: 'a "quoted", comma', amount: 200 }]);
    expect(records(csv)[1]).toBe('"a ""quoted"", comma",200');
  });

  it("quotes a field containing a newline, keeping it inside one record", () => {
    // The failure this prevents: an organizer's multi-line note shifting every
    // column from that row onward, which nobody notices until they reconcile
    // payments against the file.
    const csv = toCsv(COLUMNS, [{ venue: "line one\nline two", amount: 1 }]);
    expect(csv.slice(1)).toContain('"line one\nline two",1');
    // Records are CRLF-separated, so the bare LF inside the quotes cannot be
    // mistaken for a record boundary by a compliant reader.
    expect(records(csv)).toHaveLength(2);
  });

  it("writes an empty field for null and undefined, not the word", () => {
    const csv = toCsv(COLUMNS, [{ venue: "x", amount: null }]);
    expect(records(csv)[1]).toBe("x,");
    expect(csv).not.toContain("null");
  });

  it("neutralises a field Excel would execute as a formula", () => {
    // CSV injection. These files are opened on an organizer's own machine, and
    // a field beginning `=` is evaluated rather than displayed.
    for (const lead of ["=", "+", "-", "@"]) {
      const csv = toCsv(COLUMNS, [{ venue: `${lead}cmd|'/c calc'!A0`, amount: 0 }]);
      expect(records(csv)[1].startsWith(`"'${lead}`)).toBe(true);
    }
  });

  it("carries a BOM, so Excel on Windows reads it as UTF-8", () => {
    // Without it "Praha 3 — Pražačka" arrives as mojibake.
    const csv = toCsv(COLUMNS, [{ venue: "Praha 3 — Pražačka", amount: 200 }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Pražačka");
  });

  it("survives the seed's hostile venue unchanged", () => {
    const hostile = '<script>alert(1)</script> "Praha 2", a;b\\c';
    const csv = toCsv(COLUMNS, [{ venue: hostile, amount: 200 }]);
    // One header record and one data record — the payload did not split it.
    expect(records(csv)).toHaveLength(2);
    // And it round-trips: the doubled quotes collapse back to the original.
    const field = records(csv)[1].slice(0, -",200".length);
    expect(field.slice(1, -1).replaceAll('""', '"')).toBe(hostile);
  });

  it("renders a Date as an unambiguous instant", () => {
    const columns: CsvColumn<{ at: Date }>[] = [
      { header: "at", value: (r) => r.at },
    ];
    const csv = toCsv(columns, [{ at: new Date("2026-08-02T17:30:00.000Z") }]);
    expect(records(csv)[1]).toBe("2026-08-02T17:30:00.000Z");
  });
});

describe("csvDateStamp", () => {
  it("is the UTC date, for a filename that sorts", () => {
    expect(csvDateStamp(new Date("2026-08-02T23:30:00Z"))).toBe("2026-08-02");
  });
});
