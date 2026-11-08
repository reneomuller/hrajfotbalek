import { describe, expect, it } from "vitest";
import { playerSpend } from "@/lib/admin/players/spend";
import type { BookingSeatValue } from "@/lib/types/database";

/**
 * What one player has paid (round 42), valued the way the games' economics
 * value it: a single game at its price, a Game Pass Credit at what the pass
 * cost per game, other Credit at what was paid for it, gifts at nothing — and
 * what a late cancellation kept.
 */

function value(overrides: Partial<BookingSeatValue>): BookingSeatValue {
  return {
    booking_id: "b",
    game_id: "g",
    player_id: "p1",
    status: "confirmed",
    seats: 1,
    single_seats: 0,
    pass_seats: 0,
    credit_seats: 0,
    free_seats: 0,
    unpaid_seats: 0,
    single_czk: 0,
    pass_czk: 0,
    credit_czk: 0,
    kept_czk: 0,
    owed_czk: 0,
    ...overrides,
  };
}

describe("playerSpend", () => {
  it("adds up each way this player paid, and the total", () => {
    // Arrange
    const values = [
      value({ booking_id: "b1", single_czk: 180 }),
      value({ booking_id: "b2", pass_czk: 150 }),
      value({ booking_id: "b3", credit_czk: 180 }),
      value({ booking_id: "b4", status: "cancelled", kept_czk: 90 }),
    ];

    // Act
    const spend = playerSpend(values, "p1");

    // Assert
    expect(spend).toEqual({ singleCzk: 180, passCzk: 150, creditCzk: 180, keptCzk: 90, totalCzk: 600 });
  });

  it("ignores everybody else's bookings on the same games", () => {
    const spend = playerSpend([value({ player_id: "p2", single_czk: 180 })], "p1");
    expect(spend.totalCzk).toBe(0);
  });

  it("rounds pass values to whole crowns, as the money is shown", () => {
    const spend = playerSpend([value({ pass_czk: 149.6 }), value({ pass_czk: 149.6 })], "p1");
    expect(spend).toMatchObject({ passCzk: 299, totalCzk: 299 });
  });
});
