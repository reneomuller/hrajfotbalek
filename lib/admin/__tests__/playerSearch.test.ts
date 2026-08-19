import { describe, expect, it } from "vitest";
import { filterPlayers, normaliseForSearch } from "@/lib/admin/playerSearch";

/**
 * The admin player search.
 *
 * The cases worth a test are the ones an organizer hits on a phone in a hurry:
 * the wrong case, a name they cannot spell the accents of, and a partial.
 */

type Row = { nickname: string; email: string | null; phone: string | null };

const roster: Row[] = [
  { nickname: "Guillaume", email: "guillaume@example.test", phone: "+420777000111" },
  { nickname: "Řehoř", email: null, phone: null },
  { nickname: "GaetanGuichard", email: "gaetan@example.test", phone: null },
  { nickname: "Maria", email: "maria@example.test", phone: "+420602123456" },
];

const search = (q: string) => filterPlayers(roster, q, (p) => p.phone);

describe("filterPlayers", () => {
  it("returns everyone for an empty or whitespace query", () => {
    // Arrange / Act / Assert
    expect(search("")).toHaveLength(roster.length);
    expect(search("   ")).toHaveLength(roster.length);
  });

  it("matches a substring of the nickname, not just a prefix", () => {
    // "gui" appears at the start of one nickname and the middle of another,
    // and an organizer typing it means both.

    // Arrange / Act
    const hits = search("gui").map((p) => p.nickname);

    // Assert
    expect(hits).toEqual(["Guillaume", "GaetanGuichard"]);
  });

  it("ignores case", () => {
    // Arrange / Act / Assert
    expect(search("MARIA").map((p) => p.nickname)).toEqual(["Maria"]);
  });

  it("finds a diacritic name typed without diacritics", () => {
    // The case this exists for: `Řehoř` on a keyboard that is not producing
    // Ř at speed.

    // Arrange / Act / Assert
    expect(search("rehor").map((p) => p.nickname)).toEqual(["Řehoř"]);
    expect(search("Řeh").map((p) => p.nickname)).toEqual(["Řehoř"]);
  });

  it("matches on email and on phone", () => {
    // Arrange / Act / Assert
    expect(search("gaetan@").map((p) => p.nickname)).toEqual(["GaetanGuichard"]);
    expect(search("602123").map((p) => p.nickname)).toEqual(["Maria"]);
  });

  it("returns nothing for a query that matches nothing", () => {
    // The empty result is a real state the page renders its own copy for.

    // Arrange / Act / Assert
    expect(search("zzzz")).toEqual([]);
  });

  it("does not fall over on a player with no email and no phone", () => {
    // Arrange / Act / Assert — `Řehoř` has both null.
    expect(() => search("anything")).not.toThrow();
  });
});

describe("normaliseForSearch", () => {
  it("strips accents and case without dropping the letters", () => {
    // Arrange / Act / Assert
    expect(normaliseForSearch("Řehoř")).toBe("rehor");
    expect(normaliseForSearch("  Žluťoučký  ")).toBe("zlutoucky");
  });
});
