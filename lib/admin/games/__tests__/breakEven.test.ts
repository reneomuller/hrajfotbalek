import { describe, expect, it } from "vitest";
import { breakEvenOutlook } from "@/lib/admin/games/breakEven";

/**
 * "How many paid seats are still needed to break even" on an upcoming game
 * (round 42, the admin rebuild) — counted in MONEY, at the game's price,
 * because a Game Pass seat brought less than a single one and the owner asked
 * for exactly that difference to show.
 */
const game = {
  priceCzk: 200,
  capacity: 12,
  seatsTaken: 4,
  unpaidSeats: 0,
  pitchCostCzk: 1000 as number | null,
  profitCzk: -400 as number | null,
};

describe("breakEvenOutlook", () => {
  it("has nothing to say about a game with no pitch cost", () => {
    // Arrange
    const noVenue = { ...game, pitchCostCzk: null, profitCzk: null };

    // Act
    const outlook = breakEvenOutlook(noVenue);

    // Assert
    expect(outlook).toEqual({ kind: "none" });
  });

  it("has nothing to say about a free game, which no number of seats pays for", () => {
    // Arrange
    const free = { ...game, priceCzk: 0 };

    // Act
    const outlook = breakEvenOutlook(free);

    // Assert
    expect(outlook).toEqual({ kind: "none" });
  });

  it("says a game whose money already covers the pitch is covered", () => {
    // Arrange
    const covered = { ...game, profitCzk: 0 };

    // Act
    const outlook = breakEvenOutlook(covered);

    // Assert
    expect(outlook).toEqual({ kind: "covered" });
  });

  it("counts the shortfall in whole seats at the game's price, rounding up", () => {
    // Arrange
    const short = { ...game, profitCzk: -450 };

    // Act
    const outlook = breakEvenOutlook(short);

    // Assert
    expect(outlook).toEqual({ kind: "short", seats: 3, reachable: true });
  });

  it("does not ask for a seat over a fraction of a crown", () => {
    // Arrange — pass seats are valued at the pass price over its games.
    const almost = { ...game, profitCzk: -0.4 };

    // Act
    const outlook = breakEvenOutlook(almost);

    // Assert
    expect(outlook).toEqual({ kind: "covered" });
  });

  it("calls the target unreachable when the open seats and the unpaid ones together cannot make it", () => {
    // Arrange — 2 open seats and 1 unpaid seat, 4 seats short.
    const hopeless = { ...game, seatsTaken: 10, unpaidSeats: 1, profitCzk: -800 };

    // Act
    const outlook = breakEvenOutlook(hopeless);

    // Assert
    expect(outlook).toEqual({ kind: "short", seats: 4, reachable: false });
  });

  it("counts an unpaid seat as one that can still pay", () => {
    // Arrange — 1 open seat and 1 unpaid seat, 2 seats short.
    const tight = { ...game, seatsTaken: 11, unpaidSeats: 1, profitCzk: -400 };

    // Act
    const outlook = breakEvenOutlook(tight);

    // Assert
    expect(outlook).toEqual({ kind: "short", seats: 2, reachable: true });
  });
});
