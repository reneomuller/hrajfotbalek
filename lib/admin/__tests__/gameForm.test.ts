import { describe, expect, it } from "vitest";
import {
  DURATION_DEFAULT,
  DURATION_MAX,
  DURATION_MIN,
  NOTES_MAX,
  parseGameForm,
} from "@/lib/admin/gameForm";
import { policy } from "@/lib/policy";
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
  // Required since Phase 2 §5. The form pre-fills the creating admin's
  // nickname, so a real submission always carries one.
  organizerName: "Oliver",
  /*
   * REQUIRED SINCE ROUND 16 ITEM 10. It used to be optional and default to
   * "Not specified", which is why production's one upcoming game drew no
   * surface badge — the fact was skippable, so it was skipped.
   */
  surface: "turf",
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
    expect(result.values.surface).toBe("turf");
    expect(result.values.notes).toBeNull();
    // The Phase 2 fields default to "not stated", which is a real answer.
    expect(result.values.durationMinutes).toBeNull();
    expect(result.values.allowedSkillLevels).toBeNull();
    expect(result.values.subsPerTeam).toBeNull();
    expect(result.values.organizerPhone).toBeNull();
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

  it("accepts up to four sides, and stops at four", () => {
    // Eighteen players on one pitch is routinely run as 6v6v6 with the losing
    // side rotating off. Until migration 35 the only way to record that was to
    // leave the field blank, which is why so many games render no format chip.
    expect(parseGameForm(form({ ...VALID, format: "6v6v6" })).ok).toBe(true);
    expect(parseGameForm(form({ ...VALID, format: "7v7v7" })).ok).toBe(true);

    /*
     * ~~Four sides is not a thing anyone has asked for.~~ THE OWNER ASKED FOR
     * IT (round 18, item 9) — `7v7v7v7` was one of the two formats he reported
     * as "not updating on the card". It was not updating because it was never
     * saved: this regex refused it here, and PRODUCTION's CHECK was still the
     * two-way-only one, so even `6v6v6` was rejected there.
     */
    expect(parseGameForm(form({ ...VALID, format: "7v7v7v7" })).ok).toBe(true);

    /*
     * STILL NOT AN OPEN REPEAT, and the cap is a rendering decision rather
     * than a guess about football: the value goes into a chip on a public card
     * exactly as typed, and `6v6v6v6v6` is a chip that eats the row.
     */
    expect(parseGameForm(form({ ...VALID, format: "5v5v5v5v5" })).ok).toBe(false);
    expect(parseGameForm(form({ ...VALID, format: "6v6v" })).ok).toBe(false);
  });

  /*
   * ~~It DROPPED an unknown surface and saved the game without one.~~ It now
   * refuses (round 16, item 10). The reason for dropping was that an unknown
   * value must never reach the CHECK constraint, and that still holds — what
   * changed is what happens next. Silently saving `null` is how a game ends up
   * with no surface badge, which is the defect; refusing puts the question in
   * front of the one person who can answer it.
   */
  it("refuses an unknown surface rather than saving the game without one", () => {
    const result = parseGameForm(form({ ...VALID, surface: "lava" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.surface).toBe(strings.admin.surfaceRequired);
  });

  it("refuses a game with no surface chosen at all", () => {
    const { surface: _omitted, ...withoutSurface } = VALID;
    const result = parseGameForm(form(withoutSurface));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.surface).toBe(strings.admin.surfaceRequired);
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
  /*
   * THE PITCH NAME (migration 41).
   *
   * The interesting case is the EMPTY one: a blank box must become null, not
   * "". Null is what `venueDisplayName` reads as "use the venue's own pitch";
   * an empty string would render as a stray separator on every card for that
   * game.
   */
  describe("the pitch name", () => {
    it("is optional, and empty means the venue's own", () => {
      // Arrange / Act
      const result = parseGameForm(form({ ...VALID, pitchName: "" }));

      // Assert
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.values.pitchName).toBeNull();
    });

    it("treats whitespace as empty rather than as a name", () => {
      // Arrange / Act
      const result = parseGameForm(form({ ...VALID, pitchName: "   " }));

      // Assert
      expect(result.ok && result.values.pitchName).toBeNull();
    });

    it("keeps a typed name, trimmed", () => {
      // Arrange / Act
      const result = parseGameForm(form({ ...VALID, pitchName: "  Pitch 2  " }));

      // Assert
      expect(result.ok && result.values.pitchName).toBe("Pitch 2");
    });

    /*
     * The bound mirrors `games_pitch_name_length`. Checked here so the
     * organizer sees it beside the field rather than as a constraint name in
     * an error toast.
     */
    /*
     * `...VALID` MATTERS MOST HERE. Without it every case above failed to
     * parse for unrelated reasons — and this one PASSED, because "not ok" was
     * true for the wrong reason entirely. An over-limit assertion that cannot
     * distinguish its own failure from a missing venue is not an assertion.
     */
    it("refuses a name past the column's own limit", () => {
      // Arrange / Act
      const result = parseGameForm(form({ ...VALID, pitchName: "x".repeat(61) }));

      // Assert
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.fieldErrors.pitchName).toBeTruthy();
    });

    it("accepts a name exactly at the limit", () => {
      // Arrange / Act
      const result = parseGameForm(form({ ...VALID, pitchName: "x".repeat(60) }));

      // Assert
      expect(result.ok).toBe(true);
    });
  });

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
        organizerName: "Jindra",
        organizerPhone: "+420 601 002 003",
        durationMinutes: "75",
        subsPerTeam: "3",
        pitchName: "Pitch 2",
        language: "uk-ru",
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
      // Round 18 item 2. Carried through like every other field — and unlike
      // them it can never be null: `gameLanguageOf` resolves an absent value
      // to the column's own default rather than leaving a third state.
      language: "uk-ru",
      notes: "Gate code 4417, park on the north side.",
      organizerName: "Jindra",
      organizerPhone: "+420 601 002 003",
      pitchName: "Pitch 2",
      durationMinutes: 75,
      allowedSkillLevels: null,
      subsPerTeam: 3,
    });
  });

  it("reports every bad field at once rather than one per round trip", () => {
    const result = parseGameForm(
      form({
        venueId: "",
        startsAtIso: "",
        capacity: "0",
        priceCzk: "-5",
        format: "nope",
        organizerName: "",
        durationMinutes: "5",
        subsPerTeam: "99",
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.fieldErrors).sort()).toEqual([
      "capacity",
      "durationMinutes",
      "format",
      "organizerName",
      "priceCzk",
      "startsAt",
      "subsPerTeam",
      // Round 16 item 10: an unchosen surface is now one of the fields the
      // form reports rather than one it silently accepts as null.
      "surface",
      "venue",
    ]);
  });
});

/**
 * Phase 2 §5, §5.2, §5.3, §5.3a.
 *
 * Every bound here is also a CHECK constraint and a named RPC error — see
 * `supabase/tests/admin_games_phase2.sql`. These assert the inline error, not
 * the enforcement.
 */
describe("parseGameForm — organizer, duration, skill, substitutes", () => {
  it("requires an organizer name, because a game nobody is named as running is not a game", () => {
    const result = parseGameForm(form({ ...VALID, organizerName: "   " }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.organizerName).toBe(strings.admin.organizerNameRequired);
  });

  it("rejects an organizer name past the 60-character column CHECK", () => {
    const result = parseGameForm(form({ ...VALID, organizerName: "x".repeat(61) }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.organizerName).toBe(strings.admin.organizerNameTooLong);
  });

  it("treats a blank phone as the absence of one, not as an empty one", () => {
    const result = parseGameForm(form({ ...VALID, organizerPhone: "   " }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.organizerPhone).toBeNull();
  });

  it("keeps a phone verbatim, so a +420 prefix survives", () => {
    const result = parseGameForm(form({ ...VALID, organizerPhone: "+420 777 123 456" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.organizerPhone).toBe("+420 777 123 456");
  });

  it("accepts a duration inside the bounds, inclusive at both ends", () => {
    for (const minutes of [DURATION_MIN, 60, 90, DURATION_MAX]) {
      const result = parseGameForm(form({ ...VALID, durationMinutes: String(minutes) }));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.values.durationMinutes).toBe(minutes);
    }
  });

  it("rejects a duration outside 30–180, and a fractional one", () => {
    for (const bad of ["29", "181", "0", "-60", "60.5", "sixty"]) {
      const result = parseGameForm(form({ ...VALID, durationMinutes: bad }));
      expect(result.ok, bad).toBe(false);
      if (result.ok) return;
      expect(result.fieldErrors.durationMinutes).toBe(strings.admin.durationInvalid);
    }
  });

  it("leaves a blank duration null — 'not stated' renders as the policy fallback", () => {
    const result = parseGameForm(form({ ...VALID, durationMinutes: "" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.durationMinutes).toBeNull();
  });

  it("takes the form's default duration from the policy module, so the two cannot drift", () => {
    expect(DURATION_DEFAULT).toBe(policy.game.durationMinutes);
  });

  it("accepts 0 substitutes, which means 'none' rather than 'not stated'", () => {
    const result = parseGameForm(form({ ...VALID, subsPerTeam: "0" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.subsPerTeam).toBe(0);
  });

  it("rejects substitutes outside 0–20", () => {
    for (const bad of ["-1", "21", "2.5"]) {
      const result = parseGameForm(form({ ...VALID, subsPerTeam: bad }));
      expect(result.ok, bad).toBe(false);
      if (result.ok) return;
      expect(result.fieldErrors.subsPerTeam).toBe(strings.admin.subsInvalid);
    }
  });

  it("reads a skill selection in the canonical order, whatever order it was submitted in", () => {
    const data = form(VALID);
    data.append("allowedSkillLevels", "advanced");
    data.append("allowedSkillLevels", "beginner");
    const result = parseGameForm(data);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.allowedSkillLevels).toEqual(["beginner", "advanced"]);
  });

  it("treats no selection as all levels — null, and therefore no badge anywhere", () => {
    const result = parseGameForm(form(VALID));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.allowedSkillLevels).toBeNull();
  });

  it("treats every level ticked as the same statement as none ticked", () => {
    const data = form(VALID);
    for (const level of ["beginner", "intermediate", "advanced"]) {
      data.append("allowedSkillLevels", level);
    }
    const result = parseGameForm(data);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.allowedSkillLevels).toBeNull();
  });

  it("ignores a skill value that is not a level, rather than storing it", () => {
    const data = form(VALID);
    data.append("allowedSkillLevels", "professional");
    data.append("allowedSkillLevels", "beginner");
    const result = parseGameForm(data);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.allowedSkillLevels).toEqual(["beginner"]);
  });

  it("never derives the format from the capacity (REQ-GAME-017)", () => {
    // The contract's own case: capacity 12, format 5v5. A 12-capacity game may
    // be 5v5 with substitutes, and printing 6v6 would be a confident falsehood.
    const result = parseGameForm(
      form({ ...VALID, capacity: "12", format: "5v5", subsPerTeam: "2" }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.format).toBe("5v5");
    expect(result.values.capacity).toBe(12);
  });
});
