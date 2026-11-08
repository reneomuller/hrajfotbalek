import { describe, expect, it } from "vitest";
import { countryBreakdown, skillBreakdown } from "@/lib/admin/players/breakdowns";
import { aPlayer } from "./fixtures";

/**
 * Where the players are from and how good they say they are (round 42), over
 * COUNTED players only — a shadow has no country to report.
 */

describe("countryBreakdown", () => {
  it("ranks countries by how many players they have, ties by code", () => {
    // Arrange
    const players = [
      aPlayer({ country: "CZ" }),
      aPlayer({ country: "UA" }),
      aPlayer({ country: "CZ" }),
      aPlayer({ country: "DE" }),
    ];

    // Act
    const rows = countryBreakdown(players);

    // Assert
    expect(rows).toEqual([
      { key: "CZ", value: 2 },
      { key: "DE", value: 1 },
      { key: "UA", value: 1 },
    ]);
  });

  it("reads a lower-case code as the same country", () => {
    expect(countryBreakdown([aPlayer({ country: "cz" }), aPlayer({ country: "CZ" })])).toEqual([
      { key: "CZ", value: 2 },
    ]);
  });

  it("folds the countries past the top few into one row, and says how many", () => {
    // Arrange
    const players = ["CZ", "CZ", "SK", "DE", "PL", "UA"].map((country) => aPlayer({ country }));

    // Act
    const rows = countryBreakdown(players, 3);

    // Assert
    expect(rows).toEqual([
      { key: "CZ", value: 2 },
      { key: "DE", value: 1 },
      { key: "PL", value: 1 },
      { key: "other", value: 2, countries: 2 },
    ]);
  });

  it("puts players with no country, or one it does not know, last", () => {
    // Arrange
    const players = [aPlayer({ country: null }), aPlayer({ country: "XX" }), aPlayer({ country: "CZ" })];

    // Act
    const rows = countryBreakdown(players);

    // Assert
    expect(rows).toEqual([
      { key: "CZ", value: 1 },
      { key: "unset", value: 2 },
    ]);
  });

  it("counts only counted players", () => {
    const rows = countryBreakdown([
      aPlayer({ country: "CZ" }),
      aPlayer({ kind: "shadow", country: "DE" }),
      aPlayer({ kind: "seed", country: "DE" }),
    ]);
    expect(rows).toEqual([{ key: "CZ", value: 1 }]);
  });
});

describe("skillBreakdown", () => {
  it("reads beginner to advanced, then players who did not say, leaving out empty levels", () => {
    // Arrange
    const players = [
      aPlayer({ skillLevel: "advanced" }),
      aPlayer({ skillLevel: "beginner" }),
      aPlayer({ skillLevel: "advanced" }),
      aPlayer({ skillLevel: null }),
      aPlayer({ kind: "shadow", skillLevel: "intermediate" }),
    ];

    // Act
    const rows = skillBreakdown(players);

    // Assert
    expect(rows).toEqual([
      { key: "beginner", value: 1 },
      { key: "advanced", value: 2 },
      { key: "unset", value: 1 },
    ]);
  });
});
