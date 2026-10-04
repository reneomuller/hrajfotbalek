import { describe, expect, it } from "vitest";
import { isArchived, partitionVenues, pickableVenues } from "@/lib/venues/archive";

/**
 * ROUND 39, ITEM 2 — an archived venue leaves the picker, never a game.
 */

const venue = (id: string, archived_at?: string | null) => ({ id, name: id, archived_at });

const ACTIVE = venue("active", null);
const RETIRED = venue("retired", "2026-10-04T10:00:00Z");
// Before the migration the column is not there at all, and `select *` omits it.
const PRE_MIGRATION = venue("pre-migration");

describe("isArchived", () => {
  it("reads a stamped venue as archived", () => {
    // Arrange / Act
    const result = isArchived(RETIRED);

    // Assert
    expect(result).toBe(true);
  });

  it("reads a null or MISSING column as active, so the app works before the migration", () => {
    // Arrange / Act
    const results = [isArchived(ACTIVE), isArchived(PRE_MIGRATION)];

    // Assert
    expect(results).toEqual([false, false]);
  });
});

describe("pickableVenues", () => {
  it("drops archived venues from a new game's picker", () => {
    // Arrange
    const all = [ACTIVE, RETIRED, PRE_MIGRATION];

    // Act
    const picked = pickableVenues(all, null);

    // Assert
    expect(picked.map((v) => v.id)).toEqual(["active", "pre-migration"]);
  });

  it("keeps the game's OWN venue even when archived, so the edit form never opens unset", () => {
    // Arrange
    const all = [ACTIVE, RETIRED];

    // Act
    const picked = pickableVenues(all, "retired");

    // Assert
    expect(picked.map((v) => v.id)).toEqual(["active", "retired"]);
  });
});

describe("partitionVenues", () => {
  it("splits the admin list into active and archived, preserving order", () => {
    // Arrange
    const all = [RETIRED, ACTIVE, PRE_MIGRATION];

    // Act
    const { active, archived } = partitionVenues(all);

    // Assert
    expect(active.map((v) => v.id)).toEqual(["active", "pre-migration"]);
    expect(archived.map((v) => v.id)).toEqual(["retired"]);
  });
});
