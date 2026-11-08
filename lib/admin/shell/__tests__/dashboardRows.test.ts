import { describe, expect, it } from "vitest";
import { breakEvenNote, rowSeatBarInput, type RowSeats } from "@/lib/admin/shell/dashboardRows";

/**
 * The seat bar on each dashboard row (round 42, the admin rebuild). A plain
 * fill until pitch costs exist; the split by how each seat was paid, and the
 * break-even line, once `game_economics` can say so.
 */
const SPLIT = {
  singleSeats: 2,
  passSeats: 1,
  creditSeats: 0.5,
  freeSeats: 1,
  houseGuests: 1,
  unpaidSeats: 1,
  breakEvenSeats: 5,
};

describe("rowSeatBarInput", () => {
  it("draws every booked seat as one fill when there are no economics", () => {
    // Arrange
    const row: RowSeats = { capacity: 12, booked: 7, economics: null };

    // Act
    const input = rowSeatBarInput(row);

    // Assert
    expect(input).toEqual({
      capacity: 12,
      singleSeats: 7,
      passSeats: 0,
      creditSeats: 0,
      freeSeats: 0,
      houseGuests: 0,
      unpaidSeats: 0,
      breakEvenSeats: null,
    });
  });

  it("splits the seats by how they were paid and carries the break-even seat", () => {
    // Arrange
    const row: RowSeats = { capacity: 12, booked: 6.5, economics: SPLIT };

    // Act
    const input = rowSeatBarInput(row);

    // Assert
    expect(input).toEqual({ capacity: 12, ...SPLIT });
  });
});

describe("breakEvenNote", () => {
  it("says nothing without economics", () => {
    // Arrange
    const row: RowSeats = { capacity: 12, booked: 7, economics: null };

    // Act + Assert
    expect(breakEvenNote(row)).toBeNull();
  });

  it("says nothing for a game with no pitch cost", () => {
    // Arrange
    const row: RowSeats = { capacity: 12, booked: 7, economics: { ...SPLIT, breakEvenSeats: null } };

    // Act + Assert
    expect(breakEvenNote(row)).toBeNull();
  });

  it("counts the paid seats still needed — free, house and unpaid seats bring nothing", () => {
    // Arrange — 2 + 1 + 0.5 paid against a break-even of 5.
    const row: RowSeats = { capacity: 12, booked: 6.5, economics: SPLIT };

    // Act
    const note = breakEvenNote(row);

    // Assert
    expect(note).toEqual({ kind: "short", seats: 1.5 });
  });

  it("is past break-even once the paid seats reach it", () => {
    // Arrange
    const row: RowSeats = { capacity: 12, booked: 8, economics: { ...SPLIT, singleSeats: 3.5 } };

    // Act
    const note = breakEvenNote(row);

    // Assert
    expect(note).toEqual({ kind: "past" });
  });
});
