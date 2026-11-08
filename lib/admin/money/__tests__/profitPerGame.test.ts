import { describe, expect, it } from "vitest";
import type { GameEconomics } from "@/lib/admin/economics";
import { profitTable, seatTotals, type PlayedGame } from "@/lib/admin/money/profitPerGame";

/**
 * Profit per game (round 42, the admin rebuild). The owner: "I do want the
 * profit and break-even per game". SQL values every seat and subtracts the
 * pitch (`game_economics`); this lays the games out and totals them, and a game
 * with no pitch cost stays out of profit rather than counting as free.
 */
function economics(gameId: string, overrides: Partial<GameEconomics> = {}): GameEconomics {
  return {
    gameId,
    priceCzk: 180,
    capacity: 14,
    seatsTaken: 10,
    houseGuests: 0,
    unpaidSeats: 0,
    singleSeats: 10,
    passSeats: 0,
    creditSeats: 0,
    freeSeats: 0,
    singleCzk: 1800,
    passCzk: 0,
    creditCzk: 0,
    keptCzk: 0,
    owedCzk: 0,
    revenueCzk: 1800,
    pitchCostCzk: 1200,
    profitCzk: 600,
    breakEvenSeats: 7,
    ...overrides,
  };
}

function game(id: string): PlayedGame {
  return { id, startsAt: "2026-11-02T18:00:00.000Z", venue: `Venue ${id}` };
}

describe("profitTable", () => {
  it("keeps the games' order and leaves out a game the economics did not answer for", () => {
    // Arrange
    const games = [game("g2"), game("g1"), game("g3")];
    const byGame = new Map([
      ["g1", economics("g1")],
      ["g2", economics("g2")],
    ]);

    // Act
    const table = profitTable(games, byGame);

    // Assert
    expect(table.rows.map((row) => row.game.id)).toEqual(["g2", "g1"]);
  });

  it("totals revenue over every game but pitch cost and profit only where there is a cost", () => {
    // Arrange
    const games = [game("g1"), game("g2"), game("g3")];
    const byGame = new Map([
      ["g1", economics("g1", { revenueCzk: 1800, pitchCostCzk: 1200, profitCzk: 600 })],
      ["g2", economics("g2", { revenueCzk: 900, pitchCostCzk: 1200, profitCzk: -300 })],
      ["g3", economics("g3", { revenueCzk: 540, pitchCostCzk: null, profitCzk: null, breakEvenSeats: null })],
    ]);

    // Act
    const { totals } = profitTable(games, byGame);

    // Assert
    expect(totals).toEqual({
      revenueCzk: 3240,
      pitchCostCzk: 2400,
      profitCzk: 300,
      costedGames: 2,
      brokeEven: 1,
      uncostedGames: 1,
    });
  });

  it("counts a game that made exactly its pitch cost as broken even", () => {
    // Arrange
    const byGame = new Map([["g1", economics("g1", { revenueCzk: 1200, profitCzk: 0 })]]);

    // Act
    const { totals } = profitTable([game("g1")], byGame);

    // Assert
    expect(totals.brokeEven).toBe(1);
  });
});

describe("seatTotals", () => {
  it("adds every game's seats by kind, with no single break-even line", () => {
    // Arrange
    const rows = profitTable(
      [game("g1"), game("g2")],
      new Map([
        ["g1", economics("g1", { capacity: 14, singleSeats: 8, passSeats: 2, unpaidSeats: 1 })],
        ["g2", economics("g2", { capacity: 12, singleSeats: 4, creditSeats: 1, freeSeats: 1, houseGuests: 2 })],
      ]),
    ).rows;

    // Act
    const totals = seatTotals(rows);

    // Assert
    expect(totals).toEqual({
      capacity: 26,
      singleSeats: 12,
      passSeats: 2,
      creditSeats: 1,
      freeSeats: 1,
      houseGuests: 2,
      unpaidSeats: 1,
      breakEvenSeats: null,
    });
  });
});
