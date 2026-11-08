import { describe, expect, it } from "vitest";
import { revenueMix } from "@/lib/admin/money/revenueMix";
import type { BookingSeatValue } from "@/lib/types/database";

/**
 * Revenue by how it was paid (round 42, the admin rebuild). The owner: "we
 * also need to distinguish between someone purchasing a single credit or using
 * a credit from a game pass that'd make their entry cheaper". Every booking's
 * worth comes from SQL (`booking_seat_values`); this only adds it up and works
 * out what the cheaper pass entry cost him.
 */
function booking(overrides: Partial<BookingSeatValue>): BookingSeatValue {
  return {
    booking_id: "b",
    game_id: "g1",
    player_id: "p",
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

const PRICES = new Map([
  ["g1", 180],
  ["g2", 200],
]);

describe("revenueMix", () => {
  it("adds up single-game, Game Pass and other Credit seats separately", () => {
    // Arrange
    const values = [
      booking({ booking_id: "b1", single_seats: 2, single_czk: 360, seats: 2 }),
      booking({ booking_id: "b2", pass_seats: 1, pass_czk: 150 }),
      booking({ booking_id: "b3", credit_seats: 1, credit_czk: 180 }),
    ];

    // Act
    const mix = revenueMix(values, PRICES);

    // Assert
    expect(mix.single).toEqual({ seats: 2, czk: 360 });
    expect(mix.pass).toEqual({ seats: 1, czk: 150 });
    expect(mix.credit).toEqual({ seats: 1, czk: 180 });
  });

  it("counts money kept from late cancellations, and how many cancellations kept it", () => {
    // Arrange
    const values = [
      booking({ booking_id: "b1", status: "cancelled", seats: 0, kept_czk: 180 }),
      booking({ booking_id: "b2", status: "cancelled", seats: 0, kept_czk: 0 }),
      booking({ booking_id: "b3", single_seats: 1, single_czk: 180 }),
    ];

    // Act
    const mix = revenueMix(values, PRICES);

    // Assert
    expect(mix.kept).toEqual({ czk: 180, cancellations: 1 });
    expect(mix.totalCzk).toBe(360);
  });

  it("works out the average a seat brought, single against pass", () => {
    // Arrange — five games for 750 is 150 a pass seat.
    const values = [
      booking({ booking_id: "b1", single_seats: 2, single_czk: 360 }),
      booking({ booking_id: "b2", pass_seats: 3, pass_czk: 450 }),
    ];

    // Act
    const mix = revenueMix(values, PRICES);

    // Assert
    expect(mix.avgSingleCzk).toBe(180);
    expect(mix.avgPassCzk).toBe(150);
    expect(mix.passGapPerSeatCzk).toBe(30);
  });

  it("has no average for a kind nobody paid with", () => {
    // Arrange
    const values = [booking({ single_seats: 1, single_czk: 180 })];

    // Act
    const mix = revenueMix(values, PRICES);

    // Assert
    expect(mix.avgPassCzk).toBeNull();
    expect(mix.passGapPerSeatCzk).toBeNull();
  });

  it("prices the pass discount against each game's own price", () => {
    // Arrange — two pass seats on a 180 game and one on a 200 game, at 150 each.
    const values = [
      booking({ booking_id: "b1", game_id: "g1", pass_seats: 2, pass_czk: 300 }),
      booking({ booking_id: "b2", game_id: "g2", pass_seats: 1, pass_czk: 150 }),
    ];

    // Act
    const mix = revenueMix(values, PRICES);

    // Assert — (2 × 180 − 300) + (1 × 200 − 150)
    expect(mix.passGapTotalCzk).toBe(110);
  });

  it("counts free seats — gifts and seed bookings — without adding money", () => {
    // Arrange
    const values = [booking({ free_seats: 2, seats: 2 })];

    // Act
    const mix = revenueMix(values, PRICES);

    // Assert
    expect(mix.freeSeats).toBe(2);
    expect(mix.totalCzk).toBe(0);
  });
});
