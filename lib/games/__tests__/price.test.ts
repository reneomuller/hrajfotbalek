import { describe, expect, it } from "vitest";
import { priceForDurationCzk } from "@/lib/games/price";
import { PASS_REFERENCE_PRICE_CZK } from "@/lib/pass/creditPrice";

/**
 * ROUND 40 — a game is one Credit, whatever its length.
 *
 * ~~Round 35 v5: sixty minutes is 150, ninety is 180, and a credit buys only a
 * ninety-minute seat.~~ The owner removed the 150 CZK hour, and the terms
 * (Obchodní podmínky 5.1) make every booking a Credit — so the price the admin
 * form prefills is the Credit price for every length.
 */
describe("priceForDurationCzk", () => {
  it("prefills one Credit's price for every length", () => {
    // Arrange
    const lengths = [60, 90, 120, 75, null, undefined];

    // Act
    const prices = lengths.map((minutes) => priceForDurationCzk(minutes));

    // Assert
    expect(prices).toEqual(lengths.map(() => PASS_REFERENCE_PRICE_CZK));
  });

  it("is the standard game's 180 CZK", () => {
    // Arrange
    const standardMinutes = 90;

    // Act
    const price = priceForDurationCzk(standardMinutes);

    // Assert
    expect(price).toBe(180);
  });
});
