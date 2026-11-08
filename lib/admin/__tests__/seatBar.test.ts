import { describe, expect, it } from "vitest";
import { formatSeats, seatBar } from "@/lib/admin/seatBar";

/**
 * The seat bar on every game row and game page (round 42, the admin rebuild):
 * how full the pitch is, split by how each seat was paid, with a line where the
 * game stops losing money.
 */
const base = {
  capacity: 14,
  singleSeats: 0,
  passSeats: 0,
  creditSeats: 0,
  freeSeats: 0,
  houseGuests: 0,
  unpaidSeats: 0,
  breakEvenSeats: null as number | null,
};

describe("seatBar — the segments", () => {
  it("lays the paid kinds out in order, each as a share of capacity", () => {
    // Arrange
    const game = { ...base, singleSeats: 7, passSeats: 3.5, freeSeats: 1 };

    // Act
    const bar = seatBar(game);

    // Assert
    expect(bar.segments.map(({ kind, percent }) => [kind, percent])).toEqual([
      ["single", 50],
      ["pass", 25],
      ["free", 7.14],
    ]);
  });

  it("leaves out a kind nobody paid with, rather than drawing a zero-width sliver", () => {
    const bar = seatBar({ ...base, creditSeats: 2 });

    expect(bar.segments.map(({ kind }) => kind)).toEqual(["credit"]);
  });

  it("counts house guests and unpaid seats as taken, after the paid ones", () => {
    const bar = seatBar({ ...base, singleSeats: 2, houseGuests: 1, unpaidSeats: 1 });

    expect(bar.segments.map(({ kind }) => kind)).toEqual(["single", "house", "unpaid"]);
  });

  it("never draws past the end when a game is over capacity", () => {
    const bar = seatBar({ ...base, singleSeats: 15, houseGuests: 2 });

    expect(bar.segments.reduce((sum, { percent }) => sum + percent, 0)).toBeLessThanOrEqual(100);
  });

  it("draws nothing for a game with no capacity", () => {
    expect(seatBar({ ...base, capacity: 0, singleSeats: 3 }).segments).toEqual([]);
  });
});

describe("seatBar — the break-even line", () => {
  it("sits at the break-even seat's share of capacity", () => {
    expect(seatBar({ ...base, breakEvenSeats: 7 }).breakEvenPercent).toBe(50);
  });

  it("is not drawn without a pitch cost", () => {
    expect(seatBar(base).breakEvenPercent).toBeNull();
  });

  it("pins to the end when the game cannot break even even full", () => {
    expect(seatBar({ ...base, breakEvenSeats: 20 }).breakEvenPercent).toBe(100);
  });

  it("says whether the paid seats have reached it", () => {
    // Paid seats are the ones that brought money: single, pass, credit.
    expect(seatBar({ ...base, singleSeats: 5, passSeats: 2, breakEvenSeats: 7 }).pastBreakEven).toBe(true);
    expect(seatBar({ ...base, singleSeats: 5, freeSeats: 2, breakEvenSeats: 7 }).pastBreakEven).toBe(false);
  });
});

describe("formatSeats", () => {
  it("prints whole seats without a decimal and a half seat with one", () => {
    expect([7, 2.5, 0.333, 3.96].map(formatSeats)).toEqual(["7", "2.5", "0.3", "4"]);
  });
});

describe("seatBar — break-even by money when the profit is known", () => {
  it("is not past break-even on cheaper pass seats that fill the line but not the pitch cost", () => {
    // Arrange — seven seats is the line at full price, but three are pass
    // seats worth less, so the game is still 90 short.
    const game = { ...base, singleSeats: 4, passSeats: 3, breakEvenSeats: 7, profitCzk: -90 };

    // Act
    const bar = seatBar(game);

    // Assert
    expect(bar.pastBreakEven).toBe(false);
  });

  it("is past break-even once the profit is zero or more", () => {
    expect(seatBar({ ...base, singleSeats: 7, breakEvenSeats: 7, profitCzk: 0 }).pastBreakEven).toBe(true);
  });
});
