import { describe, expect, it } from "vitest";
import { gamePath, parseGameRef } from "@/lib/games/link";

/**
 * ROUND 41 — "would it be possible for each posted game to have a better
 * looking link rather than an extremely long one? ideally /game/<number>".
 */
describe("gamePath", () => {
  it("is the short number when the game has one", () => {
    // Act
    const path = gamePath({ id: "411268ee-0bd0-4e45-acbb-7d8ff5743740", game_number: 42 });

    // Assert
    expect(path).toBe("/game/42");
  });

  it("falls back to the id before the numbers exist", () => {
    // Act / Assert
    expect(gamePath({ id: "411268ee-0bd0-4e45-acbb-7d8ff5743740" })).toBe(
      "/game/411268ee-0bd0-4e45-acbb-7d8ff5743740",
    );
    expect(gamePath({ id: "abc", game_number: null })).toBe("/game/abc");
  });
});

describe("parseGameRef", () => {
  it("reads a short number", () => {
    // Act / Assert
    expect(parseGameRef("42")).toEqual({ kind: "number", value: 42 });
  });

  it("reads an id", () => {
    // Act / Assert
    expect(parseGameRef("411268ee-0bd0-4e45-acbb-7d8ff5743740")).toEqual({
      kind: "id",
      value: "411268ee-0bd0-4e45-acbb-7d8ff5743740",
    });
  });

  it("refuses anything else, so a typo is a 404 rather than a database error", () => {
    // Act / Assert
    expect(parseGameRef("0")).toBeNull();
    expect(parseGameRef("-3")).toBeNull();
    expect(parseGameRef("42abc")).toBeNull();
    expect(parseGameRef("99999999999")).toBeNull();
    expect(parseGameRef("not-a-game")).toBeNull();
  });
});
