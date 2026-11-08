import { describe, expect, it } from "vitest";
import { nextSort, parseSort, playersHref, sortPlayers } from "@/lib/admin/players/sort";
import { aPlayer } from "./fixtures";

/**
 * The players list sorts by a column from `?sort=&dir=` (round 42), so a
 * sorted view survives a reload and can be sent to somebody.
 */

describe("parseSort", () => {
  it("defaults to name, A to Z", () => {
    expect(parseSort(undefined, undefined)).toEqual({ key: "name", dir: "asc" });
  });

  it("ignores a column it does not know", () => {
    expect(parseSort("email", "desc")).toEqual({ key: "name", dir: "asc" });
  });

  it("gives a column its natural direction when none is asked for", () => {
    expect(parseSort("joined", undefined)).toEqual({ key: "joined", dir: "desc" });
    expect(parseSort("played", "sideways")).toEqual({ key: "played", dir: "desc" });
  });

  it("keeps an explicit direction", () => {
    expect(parseSort("credit", "asc")).toEqual({ key: "credit", dir: "asc" });
  });
});

describe("nextSort", () => {
  it("flips the direction of the column already sorted on", () => {
    expect(nextSort({ key: "played", dir: "desc" }, "played")).toEqual({ key: "played", dir: "asc" });
  });

  it("starts a new column in its natural direction", () => {
    expect(nextSort({ key: "name", dir: "asc" }, "last-game")).toEqual({ key: "last-game", dir: "desc" });
  });
});

describe("sortPlayers", () => {
  it("sorts names alphabetically, ignoring case and accents", () => {
    // Arrange
    const players = [aPlayer({ nickname: "Zdeněk" }), aPlayer({ nickname: "anna" }), aPlayer({ nickname: "Řehoř" }), aPlayer({ nickname: "Bob" })];

    // Act
    const sorted = sortPlayers(players, { key: "name", dir: "asc" });

    // Assert
    expect(sorted.map((p) => p.nickname)).toEqual(["anna", "Bob", "Řehoř", "Zdeněk"]);
  });

  it("puts the most games first, breaking a tie by name", () => {
    // Arrange
    const players = [
      aPlayer({ nickname: "Cyril", gamesPlayed: 2 }),
      aPlayer({ nickname: "Adam", gamesPlayed: 2 }),
      aPlayer({ nickname: "Bara", gamesPlayed: 7 }),
    ];

    // Act
    const sorted = sortPlayers(players, { key: "played", dir: "desc" });

    // Assert
    expect(sorted.map((p) => p.nickname)).toEqual(["Bara", "Adam", "Cyril"]);
  });

  it("keeps players who never played at the bottom of last game, either way round", () => {
    // Arrange
    const players = [
      aPlayer({ nickname: "Never", lastGameAt: null }),
      aPlayer({ nickname: "Old", lastGameAt: "2026-09-01T18:00:00Z" }),
      aPlayer({ nickname: "Recent", lastGameAt: "2026-11-01T18:00:00Z" }),
    ];

    // Act
    const newest = sortPlayers(players, { key: "last-game", dir: "desc" });
    const oldest = sortPlayers(players, { key: "last-game", dir: "asc" });

    // Assert
    expect(newest.map((p) => p.nickname)).toEqual(["Recent", "Old", "Never"]);
    expect(oldest.map((p) => p.nickname)).toEqual(["Old", "Recent", "Never"]);
  });

  it("sorts by Credit balance and by when the account was made", () => {
    // Arrange
    const players = [
      aPlayer({ nickname: "Mid", balanceCzk: 360, createdAt: "2026-10-01T10:00:00Z" }),
      aPlayer({ nickname: "Rich", balanceCzk: 900, createdAt: "2026-08-01T10:00:00Z" }),
      aPlayer({ nickname: "Empty", balanceCzk: 0, createdAt: "2026-11-01T10:00:00Z" }),
    ];

    // Act
    const byCredit = sortPlayers(players, { key: "credit", dir: "desc" });
    const byJoined = sortPlayers(players, { key: "joined", dir: "asc" });

    // Assert
    expect(byCredit.map((p) => p.nickname)).toEqual(["Rich", "Mid", "Empty"]);
    expect(byJoined.map((p) => p.nickname)).toEqual(["Rich", "Mid", "Empty"]);
  });

  it("returns a new array and leaves the one it was given alone", () => {
    // Arrange
    const players = [aPlayer({ nickname: "B" }), aPlayer({ nickname: "A" })];

    // Act
    sortPlayers(players, { key: "name", dir: "asc" });

    // Assert
    expect(players.map((p) => p.nickname)).toEqual(["B", "A"]);
  });
});

describe("playersHref", () => {
  it("is the bare page for the default view", () => {
    expect(playersHref({ segment: "all", sort: { key: "name", dir: "asc" }, q: "" })).toBe("/admin/players");
  });

  it("carries the segment, the sort and the search", () => {
    expect(
      playersHref({ segment: "came-back", sort: { key: "played", dir: "desc" }, q: "jan novák" }),
    ).toBe("/admin/players?segment=came-back&sort=played&dir=desc&q=jan+nov%C3%A1k");
  });

  it("leaves out a sort that is the default", () => {
    expect(playersHref({ segment: "shadow", sort: { key: "name", dir: "asc" }, q: "" })).toBe(
      "/admin/players?segment=shadow",
    );
  });
});
