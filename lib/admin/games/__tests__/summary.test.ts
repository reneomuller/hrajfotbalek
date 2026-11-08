import { describe, expect, it } from "vitest";
import { summariseGames } from "@/lib/admin/games/summary";

/**
 * The tiles above the games list (round 42, the admin rebuild): what the tab
 * on screen adds up to — seats, the queue, and, once the pitch costs exist,
 * the money.
 */
const game = (id: string, activeCount: number, capacity: number, waitlistCount = 0, unpaidCount = 0) => ({
  id,
  activeCount,
  capacity,
  waitlistCount,
  unpaidCount,
});

const money = (revenueCzk: number, pitchCostCzk: number | null, profitCzk: number | null) => ({
  priceCzk: 200,
  capacity: 10,
  seatsTaken: 5,
  unpaidSeats: 0,
  revenueCzk,
  pitchCostCzk,
  profitCzk,
});

describe("summariseGames", () => {
  it("adds up seats, capacity, the waitlists and the unpaid holds", () => {
    // Arrange
    const games = [game("a", 6, 12, 2, 1), game("b", 3, 10, 0, 2)];

    // Act
    const summary = summariseGames(games, null);

    // Assert
    expect(summary).toMatchObject({ games: 2, seatsTaken: 9, capacity: 22, waiting: 2, unpaidBookings: 3 });
  });

  it("gives the fill as a whole percentage, and zero for an empty tab", () => {
    // Arrange
    const some = [game("a", 6, 12), game("b", 3, 10)];

    // Act
    const percents = [summariseGames(some, null).fillPercent, summariseGames([], null).fillPercent];

    // Assert
    expect(percents).toEqual([41, 0]);
  });

  it("has no money to report without the economics", () => {
    // Arrange
    const games = [game("a", 6, 12)];

    // Act
    const summary = summariseGames(games, null);

    // Assert
    expect(summary.money).toBeNull();
  });

  it("adds up revenue, pitch costs and profit over the games that have a pitch cost", () => {
    // Arrange
    const games = [game("a", 6, 12), game("b", 3, 10), game("c", 2, 10)];
    const economics = new Map([
      ["a", money(1200, 1000, 200)],
      ["b", money(600, 1000, -400.4)],
      ["c", money(300, null, null)],
    ]);

    // Act
    const summary = summariseGames(games, economics);

    // Assert
    expect(summary.money).toEqual({
      revenueCzk: 2100,
      pitchCostCzk: 2000,
      profitCzk: -200,
      costedGames: 2,
      coveredGames: 1,
    });
  });

  it("counts a game exactly at break-even as covered", () => {
    // Arrange
    const games = [game("a", 5, 10)];
    const economics = new Map([["a", money(1000, 1000, 0)]]);

    // Act
    const summary = summariseGames(games, economics);

    // Assert
    expect(summary.money?.coveredGames).toBe(1);
  });

  it("skips a game the economics have no row for", () => {
    // Arrange
    const games = [game("a", 5, 10), game("missing", 1, 10)];
    const economics = new Map([["a", money(1000, 800, 200)]]);

    // Act
    const summary = summariseGames(games, economics);

    // Assert
    expect(summary.money).toMatchObject({ revenueCzk: 1000, costedGames: 1 });
  });
});
