import { describe, expect, it } from "vitest";
import { parsePitchCostInput } from "@/lib/admin/games/pitchCost";

/**
 * The game page's pitch-cost correction (round 42, the admin rebuild). An
 * empty box puts the game back on its venue's price; a number is the cost
 * typed by hand. The ceiling is the database's (`pitch_cost_max_czk()`), not
 * repeated here — `set_game_pitch_cost` refuses past it by name.
 */
describe("parsePitchCostInput", () => {
  it("reads an empty box as 'back to the venue's price'", () => {
    // Arrange
    const raws = ["", "   ", null];

    // Act
    const parsed = raws.map((raw) => parsePitchCostInput(raw));

    // Assert
    expect(parsed).toEqual([
      { ok: true, costCzk: null },
      { ok: true, costCzk: null },
      { ok: true, costCzk: null },
    ]);
  });

  it("reads a whole number of crowns, zero included", () => {
    // Arrange
    const raws = ["950", " 0 "];

    // Act
    const parsed = raws.map((raw) => parsePitchCostInput(raw));

    // Assert
    expect(parsed).toEqual([
      { ok: true, costCzk: 950 },
      { ok: true, costCzk: 0 },
    ]);
  });

  it("refuses a negative, a fraction or a word", () => {
    // Arrange
    const raws = ["-5", "12.5", "lots", "1e3"];

    // Act
    const parsed = raws.map((raw) => parsePitchCostInput(raw).ok);

    // Assert
    expect(parsed).toEqual([false, false, false, false]);
  });

  it("refuses a File, which is not a number anybody typed", () => {
    // Arrange
    const raw = new File(["950"], "cost.txt");

    // Act
    const parsed = parsePitchCostInput(raw);

    // Assert
    expect(parsed.ok).toBe(false);
  });
});
