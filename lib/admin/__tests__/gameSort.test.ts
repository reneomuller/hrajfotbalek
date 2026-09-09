import { describe, expect, it } from "vitest";
import {
  DEFAULT_GAME_SORT,
  parseGameSort,
  sortGames,
  type SortableGame,
} from "@/lib/admin/gameSort";

/**
 * ROUND 28, ITEM 7 — the admin games list's ordering.
 */

const game = (over: Partial<SortableGame> & { starts_at: string }): SortableGame => ({
  venue: "Praha 5 • Smíchov",
  status: "published",
  capacity: 14,
  activeCount: 0,
  unpaidCount: 0,
  ...over,
});

const OLD = game({ starts_at: "2026-09-01T18:00:00Z", venue: "Praha 9 • Zličín" });
const MID = game({ starts_at: "2026-09-05T18:00:00Z", venue: "Praha 3 • Pražačka" });
const NEW = game({ starts_at: "2026-09-09T18:00:00Z", venue: "Praha 6 • Dejvice" });

describe("parseGameSort", () => {
  it("defaults to date for anything it does not recognise", () => {
    for (const raw of [undefined, "", "  ", "nonsense", ["venue"], "DROP TABLE"]) {
      expect(parseGameSort(raw as string | undefined)).toBe(DEFAULT_GAME_SORT);
    }
  });

  it("accepts the real keys, case-insensitively", () => {
    expect(parseGameSort("venue")).toBe("venue");
    expect(parseGameSort(" UNPAID ")).toBe("unpaid");
  });
});

describe("sortGames", () => {
  it("defaults to newest kick-off first, reproducing the query's own order", () => {
    // Arrange / Act
    const sorted = sortGames([OLD, NEW, MID], "date");

    // Assert
    expect(sorted.map((g) => g.starts_at)).toEqual([
      NEW.starts_at,
      MID.starts_at,
      OLD.starts_at,
    ]);
  });

  it("does not mutate the array it was given", () => {
    // Arrange
    const input = [OLD, NEW, MID];

    // Act
    sortGames(input, "venue");

    // Assert: the page renders the returned array; a mutated input would mean
    // two orderings depending on who read it first.
    expect(input).toEqual([OLD, NEW, MID]);
  });

  it("orders by venue name, then newest first within a venue", () => {
    // Arrange
    const a = game({ starts_at: "2026-09-01T18:00:00Z", venue: "Alpha" });
    const b = game({ starts_at: "2026-09-08T18:00:00Z", venue: "Alpha" });
    const c = game({ starts_at: "2026-09-04T18:00:00Z", venue: "Beta" });

    // Act
    const sorted = sortGames([a, c, b], "venue");

    // Assert
    expect(sorted.map((g) => `${g.venue}@${g.starts_at.slice(8, 10)}`)).toEqual([
      "Alpha@08",
      "Alpha@01",
      "Beta@04",
    ]);
  });

  it("orders by how FULL a game is, as a ratio and not a raw count", () => {
    /*
     * THE CASE THAT MAKES IT A RATIO. Six of six is a decision to make; twelve
     * of fourteen is not yet. A raw count would put the bigger game first and
     * bury the one that is actually finished.
     */
    // Arrange
    const small = game({ starts_at: "2026-09-01T18:00:00Z", capacity: 6, activeCount: 6 });
    const large = game({ starts_at: "2026-09-02T18:00:00Z", capacity: 14, activeCount: 12 });

    // Act
    const sorted = sortGames([large, small], "filled");

    // Assert
    expect(sorted[0]).toBe(small);
  });

  it("treats a zero-capacity game as empty rather than as NaN", () => {
    // Arrange
    const broken = game({ starts_at: "2026-09-03T18:00:00Z", capacity: 0, activeCount: 0 });
    const half = game({ starts_at: "2026-09-02T18:00:00Z", capacity: 10, activeCount: 5 });

    // Act
    const sorted = sortGames([broken, half], "filled");

    // Assert: NaN comparisons return false in both directions, which leaves
    // the order down to the input — the bug this asserts against.
    expect(sorted[0]).toBe(half);
  });

  it("orders by unpaid seats, most first — the chase list", () => {
    // Arrange
    const clean = game({ starts_at: "2026-09-08T18:00:00Z", unpaidCount: 0 });
    const messy = game({ starts_at: "2026-09-01T18:00:00Z", unpaidCount: 4 });

    // Act
    const sorted = sortGames([clean, messy], "unpaid");

    // Assert
    expect(sorted[0]).toBe(messy);
  });

  it("orders by status in attention order, not alphabetically", () => {
    // Arrange
    const settled = game({ starts_at: "2026-09-08T18:00:00Z", status: "settled" });
    const full = game({ starts_at: "2026-09-01T18:00:00Z", status: "full" });
    const published = game({ starts_at: "2026-09-02T18:00:00Z", status: "published" });

    // Act
    const sorted = sortGames([settled, published, full], "status");

    // Assert: alphabetically this would be cancelled/full/published/settled;
    // what an admin wants is what needs them first.
    expect(sorted.map((g) => g.status)).toEqual(["full", "published", "settled"]);
  });

  it("breaks every tie on kick-off, so a refresh cannot reshuffle the list", () => {
    // Arrange — identical on every sortable dimension but the date.
    const a = game({ starts_at: "2026-09-01T18:00:00Z" });
    const b = game({ starts_at: "2026-09-07T18:00:00Z" });

    // Act / Assert
    for (const key of ["venue", "filled", "unpaid", "status"] as const) {
      expect(sortGames([a, b], key)[0], `${key} left a tie unresolved`).toBe(b);
      expect(sortGames([b, a], key)[0], `${key} depended on input order`).toBe(b);
    }
  });
});
