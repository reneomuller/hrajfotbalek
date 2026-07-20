import { describe, expect, it } from "vitest";
import {
  buildIcsEvent,
  escapeIcsText,
  foldIcsLine,
  formatIcsDate,
  icsFilename,
} from "@/lib/calendar/ics";

const START = "2026-07-25T17:30:00.000Z";

function lines(ics: string): string[] {
  return ics.split("\r\n");
}

/** Unfolds continuation lines so a folded value can be asserted whole. */
function unfold(ics: string): string {
  return ics.replace(/\r\n /g, "");
}

describe("ics text escaping", () => {
  it("escapes backslashes first so later escapes are not doubled", () => {
    expect(escapeIcsText("a\\b")).toBe("a\\\\b");
    // If `\` were escaped last, `a;b` -> `a\;b` -> `a\\;b` — wrong.
    expect(escapeIcsText("a;b")).toBe("a\\;b");
    expect(escapeIcsText("a\\;b")).toBe("a\\\\\\;b");
  });

  it("escapes semicolons and commas", () => {
    expect(escapeIcsText("Praha 2, Vinohrady; pitch 3")).toBe(
      "Praha 2\\, Vinohrady\\; pitch 3",
    );
  });

  it("escapes newlines in all three line-ending flavours", () => {
    expect(escapeIcsText("a\nb")).toBe("a\\nb");
    expect(escapeIcsText("a\r\nb")).toBe("a\\nb");
    expect(escapeIcsText("a\rb")).toBe("a\\nb");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeIcsText("Praha 3 — Pražačka")).toBe("Praha 3 — Pražačka");
  });
});

describe("ics timestamps", () => {
  it("formats as a UTC iCalendar timestamp", () => {
    expect(formatIcsDate(START)).toBe("20260725T173000Z");
  });

  it("rejects an invalid date rather than emitting a broken field", () => {
    expect(() => formatIcsDate("not-a-date")).toThrow(TypeError);
  });
});

describe("ics line folding", () => {
  it("leaves a short line alone", () => {
    expect(foldIcsLine("SUMMARY:short")).toBe("SUMMARY:short");
  });

  it("folds a line longer than 75 octets with a leading space", () => {
    const folded = foldIcsLine(`SUMMARY:${"a".repeat(200)}`);
    expect(folded).toContain("\r\n ");
    for (const segment of folded.split("\r\n")) {
      expect(new TextEncoder().encode(segment).length).toBeLessThanOrEqual(75);
    }
  });

  it("counts octets, not characters, and splits on character boundaries", () => {
    // Each 'ř' is two UTF-8 bytes, so 50 of them exceed 75 octets at only 50
    // characters — a character-counting implementation would not fold here.
    const folded = foldIcsLine(`LOCATION:${"ř".repeat(50)}`);
    expect(folded).toContain("\r\n ");
    for (const segment of folded.split("\r\n")) {
      expect(new TextEncoder().encode(segment).length).toBeLessThanOrEqual(75);
    }
    // No character was cut in half.
    expect(unfold(folded)).toBe(`LOCATION:${"ř".repeat(50)}`);
  });
});

describe("ics event", () => {
  const base = { uid: "game-1", venue: "Praha 3 — Pražačka", startsAt: START };

  it("builds a valid single-event calendar", () => {
    const ics = buildIcsEvent(base);
    const l = lines(ics);

    expect(l[0]).toBe("BEGIN:VCALENDAR");
    expect(l).toContain("VERSION:2.0");
    expect(l).toContain("BEGIN:VEVENT");
    expect(l).toContain("END:VEVENT");
    expect(l).toContain("END:VCALENDAR");
    expect(ics.endsWith("\r\n")).toBe(true);
  });

  it("uses CRLF line endings throughout", () => {
    const ics = buildIcsEvent(base);
    expect(ics).toContain("\r\n");
    // No bare LF anywhere.
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });

  it("defaults to a 90-minute duration", () => {
    const ics = buildIcsEvent(base);
    expect(ics).toContain("DTSTART:20260725T173000Z");
    expect(ics).toContain("DTEND:20260725T190000Z");
  });

  it("honours an explicit duration", () => {
    const ics = buildIcsEvent({ ...base, durationMinutes: 60 });
    expect(ics).toContain("DTEND:20260725T183000Z");
  });

  it("puts the venue in LOCATION", () => {
    expect(buildIcsEvent(base)).toContain("LOCATION:Praha 3 — Pražačka");
  });

  it("stays valid for a venue full of iCalendar special characters", () => {
    const venue = 'Praha 2, Vinohrady; pitch\\3\ngate 4';
    const ics = buildIcsEvent({ ...base, venue });
    const flat = unfold(ics);

    // The venue occupies exactly one LOCATION line — no field was split by an
    // unescaped comma, semicolon or newline.
    const locations = flat.split("\r\n").filter((l) => l.startsWith("LOCATION:"));
    expect(locations).toHaveLength(1);
    expect(locations[0]).toBe(
      "LOCATION:Praha 2\\, Vinohrady\\; pitch\\\\3\\ngate 4",
    );

    // Structure survived intact.
    const l = flat.split("\r\n");
    expect(l.filter((x) => x === "BEGIN:VEVENT")).toHaveLength(1);
    expect(l.filter((x) => x === "END:VCALENDAR")).toHaveLength(1);
  });

  it("stays valid for the hostile-venue fixture", () => {
    const venue = '<script>alert(1)</script> "Praha 2", a;b\\c';
    const flat = unfold(buildIcsEvent({ ...base, venue }));
    const locations = flat.split("\r\n").filter((l) => l.startsWith("LOCATION:"));

    expect(locations).toHaveLength(1);
    expect(locations[0]).toContain("a\\;b\\\\c");
    expect(locations[0]).toContain('\\, a');
  });

  it("includes the game URL when given", () => {
    const ics = buildIcsEvent({ ...base, url: "https://hrajfotbal.com/game/1" });
    expect(unfold(ics)).toContain("URL:https://hrajfotbal.com/game/1");
  });

  it("rejects an invalid start time", () => {
    expect(() => buildIcsEvent({ ...base, startsAt: "nope" })).toThrow(TypeError);
  });
});

describe("ics filename", () => {
  it("slugifies a venue", () => {
    expect(icsFilename("Praha 3 — Pražačka")).toBe("praha-3-prazacka.ics");
  });

  it("strips characters that are unsafe in a filename", () => {
    expect(icsFilename('<script>/../x"')).toBe("script-x.ics");
  });

  it("falls back when nothing survives slugification", () => {
    expect(icsFilename("///")).toBe("game.ics");
  });
});
