import { describe, expect, it } from "vitest";
import { NOTES_MAX, parseGameForm } from "@/lib/admin/gameForm";
import { strings } from "@/lib/strings";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const VALID = {
  venueId: "11110000-0000-0000-0000-000000000e01",
  startsAtIso: "2026-08-02T18:00:00.000Z",
  capacity: "14",
  priceCzk: "200",
};

describe("parseGameForm", () => {
  it("accepts a minimal valid game", () => {
    const result = parseGameForm(form(VALID));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.venueId).toBe(VALID.venueId);
    expect(result.values.capacity).toBe(14);
    expect(result.values.priceCzk).toBe(200);
    expect(result.values.format).toBeNull();
    expect(result.values.surface).toBeNull();
    expect(result.values.notes).toBeNull();
  });

  it("requires a venue choice", () => {
    const result = parseGameForm(form({ ...VALID, venueId: "" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.venue).toBe(strings.admin.venueRequired);
  });

  it("requires a name when adding a new venue", () => {
    const result = parseGameForm(form({ ...VALID, venueId: "new" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.venue).toBe(strings.admin.venueNameRequired);
  });

  it("builds the image path from a filename — the directory is not user input", () => {
    const result = parseGameForm(
      form({ ...VALID, venueId: "new", newVenueName: "Pražačka", newVenueImage: "prazacka.jpg" }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.newVenueImagePath).toBe("/venues/prazacka.jpg");
  });

  it("rejects an image filename that is really a path or a URL", () => {
    for (const bad of [
      "../../etc/passwd",
      "/etc/passwd",
      "https://evil.example/x.png",
      "javascript:alert(1)",
      "x.svg",
    ]) {
      const result = parseGameForm(
        form({ ...VALID, venueId: "new", newVenueName: "Somewhere", newVenueImage: bad }),
      );
      expect(result.ok, bad).toBe(false);
      if (result.ok) continue;
      expect(result.fieldErrors.venue).toBe(strings.admin.venueImageInvalid);
    }
  });

  it("rejects a missing or unparseable kick-off rather than guessing a zone", () => {
    for (const bad of ["", "next sunday", "2026-13-45T99:99"]) {
      const result = parseGameForm(form({ ...VALID, startsAtIso: bad }));
      expect(result.ok, bad).toBe(false);
      if (result.ok) continue;
      expect(result.fieldErrors.startsAt).toBe(strings.admin.startsAtRequired);
    }
  });

  it("rejects a non-positive or fractional capacity", () => {
    for (const bad of ["0", "-2", "7.5", "lots"]) {
      const result = parseGameForm(form({ ...VALID, capacity: bad }));
      expect(result.ok, bad).toBe(false);
    }
  });

  it("accepts a zero price but not a negative one", () => {
    expect(parseGameForm(form({ ...VALID, priceCzk: "0" })).ok).toBe(true);
    expect(parseGameForm(form({ ...VALID, priceCzk: "-1" })).ok).toBe(false);
  });

  it("mirrors the format CHECK", () => {
    expect(parseGameForm(form({ ...VALID, format: "6v6" })).ok).toBe(true);
    expect(parseGameForm(form({ ...VALID, format: "11v11" })).ok).toBe(true);
    const bad = parseGameForm(form({ ...VALID, format: "six-a-side" }));
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.fieldErrors.format).toBe(strings.admin.formatInvalid);
  });

  it("drops an unknown surface instead of sending it to the CHECK", () => {
    const result = parseGameForm(form({ ...VALID, surface: "lava" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.surface).toBeNull();
  });

  it("keeps a known surface", () => {
    const result = parseGameForm(form({ ...VALID, surface: "turf" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.surface).toBe("turf");
  });

  it("bounds notes at the same length the CHECK does", () => {
    expect(parseGameForm(form({ ...VALID, notes: "x".repeat(NOTES_MAX) })).ok).toBe(true);
    const over = parseGameForm(form({ ...VALID, notes: "x".repeat(NOTES_MAX + 1) }));
    expect(over.ok).toBe(false);
    if (over.ok) return;
    expect(over.fieldErrors.notes).toBe(strings.admin.notesTooLong);
  });

  /*
   * The M4 gate reported that what the organizer typed was not what got saved.
   * The parse was never the culprit — but "every submitted field arrives at the
   * action unchanged" is the property that was doubted, so it is asserted here,
   * on values that share nothing with the form's own defaults (capacity 14,
   * price 200) or with an empty string. `verify-game-form.check.ts` carries the
   * same assertion the rest of the way, to the stored row.
   */
  it("carries every non-default field through untouched", () => {
    const result = parseGameForm(
      form({
        venueId: "new",
        newVenueName: "Praha 9 — Vysočany",
        newVenueImage: "vysocany.webp",
        newVenueMapQuery: "Vysočany sports hall, Praha",
        startsAtIso: "2026-09-13T17:45:00.000Z",
        capacity: "18",
        priceCzk: "333",
        format: "9v9",
        surface: "sand",
        notes: "Gate code 4417, park on the north side.",
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values).toEqual({
      venueId: null,
      newVenueName: "Praha 9 — Vysočany",
      newVenueImagePath: "/venues/vysocany.webp",
      newVenueMapQuery: "Vysočany sports hall, Praha",
      startsAt: "2026-09-13T17:45:00.000Z",
      capacity: 18,
      priceCzk: 333,
      format: "9v9",
      surface: "sand",
      notes: "Gate code 4417, park on the north side.",
    });
  });

  it("reports every bad field at once rather than one per round trip", () => {
    const result = parseGameForm(
      form({ venueId: "", startsAtIso: "", capacity: "0", priceCzk: "-5", format: "nope" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.fieldErrors).sort()).toEqual([
      "capacity",
      "format",
      "priceCzk",
      "startsAt",
      "venue",
    ]);
  });
});
