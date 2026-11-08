import { describe, expect, it } from "vitest";
import {
  DEFAULT_GAME_TAB,
  gameTabOf,
  gamesListHref,
  groupGamesByTab,
  parseGameTab,
  soonestGame,
} from "@/lib/admin/games/tabs";

/**
 * The games list's three tabs (round 42, the admin rebuild): Upcoming, Played,
 * Cancelled — decided by the game's status AND its kick-off, because a game
 * whose kick-off has passed is over whether or not the sweep has marked it yet.
 */
const NOW = Date.parse("2026-11-08T12:00:00Z");
const TOMORROW = "2026-11-09T18:00:00Z";
const YESTERDAY = "2026-11-07T18:00:00Z";

describe("parseGameTab", () => {
  it("reads a known tab from the query string", () => {
    // Arrange
    const raw = "played";

    // Act
    const tab = parseGameTab(raw);

    // Assert
    expect(tab).toBe("played");
  });

  it("falls back to Upcoming for anything it does not know", () => {
    // Arrange
    const raws = [undefined, "", "drafts", ["played", "cancelled"]];

    // Act
    const tabs = raws.map((raw) => parseGameTab(raw));

    // Assert
    expect(tabs).toEqual(["upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(DEFAULT_GAME_TAB).toBe("upcoming");
  });

  it("ignores case and surrounding space", () => {
    // Arrange
    const raw = "  Cancelled ";

    // Act
    const tab = parseGameTab(raw);

    // Assert
    expect(tab).toBe("cancelled");
  });
});

describe("gameTabOf", () => {
  it("puts a published game that has not kicked off under Upcoming", () => {
    // Arrange
    const game = { status: "published", starts_at: TOMORROW };

    // Act
    const tab = gameTabOf(game, NOW);

    // Assert
    expect(tab).toBe("upcoming");
  });

  it("puts a full game that has not kicked off under Upcoming", () => {
    // Arrange
    const game = { status: "full", starts_at: TOMORROW };

    // Act
    const tab = gameTabOf(game, NOW);

    // Assert
    expect(tab).toBe("upcoming");
  });

  it("puts a published game whose kick-off has passed under Played, before the sweep marks it", () => {
    // Arrange
    const game = { status: "published", starts_at: YESTERDAY };

    // Act
    const tab = gameTabOf(game, NOW);

    // Assert
    expect(tab).toBe("played");
  });

  it("puts a game kicking off this very instant under Played", () => {
    // Arrange
    const game = { status: "full", starts_at: new Date(NOW).toISOString() };

    // Act
    const tab = gameTabOf(game, NOW);

    // Assert
    expect(tab).toBe("played");
  });

  it("puts played and settled games under Played, whatever the clock says", () => {
    // Arrange
    const played = { status: "played", starts_at: TOMORROW };
    const settled = { status: "settled", starts_at: YESTERDAY };

    // Act
    const tabs = [gameTabOf(played, NOW), gameTabOf(settled, NOW)];

    // Assert
    expect(tabs).toEqual(["played", "played"]);
  });

  it("puts a cancelled game under Cancelled, past or future", () => {
    // Arrange
    const future = { status: "cancelled", starts_at: TOMORROW };
    const past = { status: "cancelled", starts_at: YESTERDAY };

    // Act
    const tabs = [gameTabOf(future, NOW), gameTabOf(past, NOW)];

    // Assert
    expect(tabs).toEqual(["cancelled", "cancelled"]);
  });
});

describe("groupGamesByTab", () => {
  it("splits a list into the three tabs, keeping each tab's rows in the order given", () => {
    // Arrange
    const games = [
      { id: "a", status: "published", starts_at: TOMORROW },
      { id: "b", status: "cancelled", starts_at: TOMORROW },
      { id: "c", status: "settled", starts_at: YESTERDAY },
      { id: "d", status: "full", starts_at: "2026-11-20T18:00:00Z" },
      { id: "e", status: "published", starts_at: YESTERDAY },
    ];

    // Act
    const groups = groupGamesByTab(games, NOW);

    // Assert
    expect({
      upcoming: groups.upcoming.map((g) => g.id),
      played: groups.played.map((g) => g.id),
      cancelled: groups.cancelled.map((g) => g.id),
    }).toEqual({ upcoming: ["a", "d"], played: ["c", "e"], cancelled: ["b"] });
  });
});

describe("soonestGame", () => {
  it("picks the game that kicks off first, whatever order the list is in", () => {
    // Arrange
    const games = [
      { id: "later", starts_at: "2026-11-20T18:00:00Z" },
      { id: "next", starts_at: "2026-11-09T18:00:00Z" },
      { id: "middle", starts_at: "2026-11-12T18:00:00Z" },
    ];

    // Act
    const next = soonestGame(games);

    // Assert
    expect(next?.id).toBe("next");
  });

  it("has nothing to pick from an empty tab", () => {
    // Arrange
    const games: { starts_at: string }[] = [];

    // Act
    const next = soonestGame(games);

    // Assert
    expect(next).toBeNull();
  });
});

describe("gamesListHref", () => {
  it("is the bare list for the default tab and the default sort", () => {
    // Arrange
    const state = { tab: "upcoming", sort: "date" } as const;

    // Act
    const href = gamesListHref(state);

    // Assert
    expect(href).toBe("/admin/games");
  });

  it("carries only what differs from the defaults", () => {
    // Arrange
    const sortOnly = { tab: "upcoming", sort: "venue" } as const;
    const tabOnly = { tab: "played", sort: "date" } as const;

    // Act
    const hrefs = [gamesListHref(sortOnly), gamesListHref(tabOnly)];

    // Assert
    expect(hrefs).toEqual(["/admin/games?sort=venue", "/admin/games?tab=played"]);
  });

  it("keeps the tab when the sort changes, and the sort when the tab changes", () => {
    // Arrange
    const state = { tab: "cancelled", sort: "unpaid" } as const;

    // Act
    const href = gamesListHref(state);

    // Assert
    expect(href).toBe("/admin/games?tab=cancelled&sort=unpaid");
  });
});
