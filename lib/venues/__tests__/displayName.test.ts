import { describe, expect, it } from "vitest";
import { venueDisplayName } from "@/lib/venues/displayName";

describe("venueDisplayName", () => {
  it("prefixes the pitch name when one is set", () => {
    expect(venueDisplayName("Praha 3 • Pražačka", "Sportovní centrum")).toBe(
      "Sportovní centrum · Praha 3 • Pražačka",
    );
  });

  it("renders the venue alone when the pitch name is null", () => {
    // The normal case, and the reason the column is nullable: no row is ever
    // blocked on a name nobody has written yet.
    expect(venueDisplayName("Praha 4 • Podolí", null)).toBe("Praha 4 • Podolí");
    expect(venueDisplayName("Praha 4 • Podolí", undefined)).toBe("Praha 4 • Podolí");
  });

  it("treats a whitespace-only pitch name as absent", () => {
    // The CHECK forbids an empty string, but a row written before it — or by a
    // future path that trims differently — must not render a leading separator
    // with nothing before it.
    expect(venueDisplayName("Praha 7 • Letná", "   ")).toBe("Praha 7 • Letná");
  });

  it("never parses the venue string", () => {
    // `venues.name` is admin free text; one seeded row is an XSS payload. The
    // middot joins two stored fields and never splits one.
    const hostile = '<script>alert(1)</script> "Praha 2", a;b\\c';
    expect(venueDisplayName(hostile, null)).toBe(hostile);
    expect(venueDisplayName(hostile, "Pitch")).toBe(`Pitch · ${hostile}`);
  });
});
