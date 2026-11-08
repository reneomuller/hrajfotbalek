import { describe, expect, it } from "vitest";
import {
  seatBarFromHolders,
  seatGrid,
  seatHolders,
  wholeSeats,
  type RosterSeatRow,
} from "@/lib/admin/games/seatGrid";
import type { BookingSeatValue } from "@/lib/types/database";

/**
 * The seat grid on a game's admin page (round 42, the admin rebuild): one cell
 * per seat on the pitch, coloured by how it was paid — the friend's mock, in
 * this product's colours — and labelled with who holds it.
 */
const row = (over: Partial<RosterSeatRow> & { id: string }): RosterSeatRow => ({
  nickname: over.id,
  status: "confirmed",
  paymentMethod: "qr",
  guestCount: 0,
  ...over,
});

const value = (over: Partial<BookingSeatValue> & { booking_id: string }): BookingSeatValue => ({
  game_id: "g",
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
  ...over,
});

const none = { single: 0, pass: 0, credit: 0, free: 0, unpaid: 0 };

describe("wholeSeats", () => {
  it("keeps whole seats as they are", () => {
    // Arrange
    const parts = { ...none, single: 2, pass: 1 };

    // Act
    const seats = wholeSeats(parts, 3, "single");

    // Assert
    expect(seats).toEqual({ ...none, single: 2, pass: 1 });
  });

  it("gives a split seat to the kind holding the larger share of it", () => {
    // Arrange — a Credit pool that mixed pass and gifted money.
    const parts = { ...none, pass: 0.7, free: 0.3 };

    // Act
    const seats = wholeSeats(parts, 1, "single");

    // Assert
    expect(seats).toEqual({ ...none, pass: 1 });
  });

  it("puts seats the parts do not account for on the fallback kind", () => {
    // Arrange
    const parts = { ...none, credit: 1 };

    // Act
    const seats = wholeSeats(parts, 3, "unpaid");

    // Assert
    expect(seats).toEqual({ ...none, credit: 1, unpaid: 2 });
  });

  it("never hands out more seats than the booking holds", () => {
    // Arrange
    const parts = { ...none, single: 2, credit: 1 };

    // Act
    const seats = wholeSeats(parts, 2, "single");

    // Assert
    expect(Object.values(seats).reduce((sum, n) => sum + n, 0)).toBe(2);
  });
});

describe("seatHolders", () => {
  it("reads each live booking's seats off its seat values, in roster order", () => {
    // Arrange
    const roster = [row({ id: "b1", nickname: "Ana" }), row({ id: "b2", nickname: "Ben", guestCount: 1 })];
    const values = [
      value({ booking_id: "b2", seats: 2, pass_seats: 2 }),
      value({ booking_id: "b1", seats: 1, single_seats: 1 }),
    ];

    // Act
    const holders = seatHolders(roster, values);

    // Assert
    expect(holders).toEqual([
      { bookingId: "b1", nickname: "Ana", seats: { ...none, single: 1 } },
      { bookingId: "b2", nickname: "Ben", seats: { ...none, pass: 2 } },
    ]);
  });

  it("leaves out cancelled and expired bookings, which hold no seat", () => {
    // Arrange
    const roster = [
      row({ id: "gone", status: "cancelled" }),
      row({ id: "late", status: "expired" }),
      row({ id: "here" }),
    ];

    // Act
    const holders = seatHolders(roster, null);

    // Assert
    expect(holders.map((h) => h.bookingId)).toEqual(["here"]);
  });

  it("without seat values, reads the kind off the booking — free, Credit, unpaid or single", () => {
    // Arrange
    const roster = [
      row({ id: "seed", paymentMethod: "seed_free" }),
      row({ id: "wallet", paymentMethod: "credit" }),
      row({ id: "cash", status: "reserved", paymentMethod: "cash", guestCount: 1 }),
      row({ id: "card", paymentMethod: "qr" }),
    ];

    // Act
    const holders = seatHolders(roster, null);

    // Assert
    expect(holders.map((h) => [h.bookingId, h.seats])).toEqual([
      ["seed", { ...none, free: 1 }],
      ["wallet", { ...none, credit: 1 }],
      ["cash", { ...none, unpaid: 2 }],
      ["card", { ...none, single: 1 }],
    ]);
  });

  it("falls back to the booking itself for a row the seat values do not cover", () => {
    // Arrange
    const roster = [row({ id: "b1" }), row({ id: "b2", status: "reserved" })];
    const values = [value({ booking_id: "b1", single_seats: 1 })];

    // Act
    const holders = seatHolders(roster, values);

    // Assert
    expect(holders[1]).toEqual({ bookingId: "b2", nickname: "b2", seats: { ...none, unpaid: 1 } });
  });
});

describe("seatGrid", () => {
  it("draws one cell per seat of capacity, the open ones last", () => {
    // Arrange
    const holders = [{ bookingId: "b1", nickname: "Ana", seats: { ...none, single: 1 } }];

    // Act
    const cells = seatGrid({ capacity: 4, houseGuests: 0, holders });

    // Assert
    expect(cells.map((c) => [c.number, c.kind])).toEqual([
      [1, "single"],
      [2, "open"],
      [3, "open"],
      [4, "open"],
    ]);
  });

  it("orders taken seats the way the seat bar does: paid, free, house, unpaid", () => {
    // Arrange
    const holders = [
      { bookingId: "u", nickname: "Uma", seats: { ...none, unpaid: 1 } },
      { bookingId: "f", nickname: "Fil", seats: { ...none, free: 1 } },
      { bookingId: "p", nickname: "Pia", seats: { ...none, pass: 1 } },
      { bookingId: "s", nickname: "Sam", seats: { ...none, single: 1 } },
      { bookingId: "c", nickname: "Cid", seats: { ...none, credit: 1 } },
    ];

    // Act
    const cells = seatGrid({ capacity: 7, houseGuests: 1, holders });

    // Assert
    expect(cells.map((c) => c.kind)).toEqual(["single", "pass", "credit", "free", "house", "unpaid", "open"]);
  });

  it("names the holder on every seat of a party and marks the friends they brought", () => {
    // Arrange
    const holders = [{ bookingId: "b1", nickname: "Ana", seats: { ...none, single: 3 } }];

    // Act
    const cells = seatGrid({ capacity: 3, houseGuests: 0, holders });

    // Assert
    expect(cells.map((c) => [c.nickname, c.isGuest])).toEqual([
      ["Ana", false],
      ["Ana", true],
      ["Ana", true],
    ]);
  });

  it("marks only a party's first seat as theirs when its seats were paid two ways", () => {
    // Arrange
    const holders = [{ bookingId: "b1", nickname: "Ana", seats: { ...none, credit: 1, unpaid: 1 } }];

    // Act
    const cells = seatGrid({ capacity: 2, houseGuests: 0, holders });

    // Assert
    expect(cells.map((c) => [c.kind, c.isGuest])).toEqual([
      ["credit", false],
      ["unpaid", true],
    ]);
  });

  it("draws every taken seat and no open one when a game is over capacity", () => {
    // Arrange
    const holders = [{ bookingId: "b1", nickname: "Ana", seats: { ...none, single: 3 } }];

    // Act
    const cells = seatGrid({ capacity: 2, houseGuests: 1, holders });

    // Assert
    expect(cells.map((c) => c.kind)).toEqual(["single", "single", "single", "house"]);
  });

  it("gives every cell a key that is unique on the page", () => {
    // Arrange
    const holders = [{ bookingId: "b1", nickname: "Ana", seats: { ...none, single: 2 } }];

    // Act
    const cells = seatGrid({ capacity: 5, houseGuests: 1, holders });

    // Assert
    expect(new Set(cells.map((c) => c.key)).size).toBe(cells.length);
  });
});

describe("seatBarFromHolders", () => {
  it("totals the holders' seats into the seat bar's input, with no break-even line", () => {
    // Arrange
    const holders = [
      { bookingId: "a", nickname: "A", seats: { ...none, single: 2, unpaid: 1 } },
      { bookingId: "b", nickname: "B", seats: { ...none, credit: 1, free: 1 } },
    ];

    // Act
    const input = seatBarFromHolders({ capacity: 10, houseGuests: 2, holders });

    // Assert
    expect(input).toEqual({
      capacity: 10,
      singleSeats: 2,
      passSeats: 0,
      creditSeats: 1,
      freeSeats: 1,
      houseGuests: 2,
      unpaidSeats: 1,
      breakEvenSeats: null,
    });
  });
});
