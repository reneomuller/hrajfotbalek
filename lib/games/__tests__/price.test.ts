import { describe, expect, it } from "vitest";
import {
  CREDIT_SEAT_MINUTES,
  gameTakesCredit,
  priceForDurationCzk,
} from "@/lib/games/price";
import { PASS_REFERENCE_PRICE_CZK } from "@/lib/pass/creditPrice";

/**
 * ROUND 35 v5, ITEMS 1 AND 2 — the mapping, and what a credit buys.
 */

describe("priceForDurationCzk", () => {
  it("prices the two lengths the product sells", () => {
    expect(priceForDurationCzk(60)).toBe(150);
    expect(priceForDurationCzk(90)).toBe(180);
  });

  it("reads a null length as the standard one", () => {
    /*
     * Nineteen historical games carry no duration. They render as the standard
     * length, so they are priced as one — reading null as "unknown, charge the
     * higher price" would bill for time nobody booked.
     */
    expect(priceForDurationCzk(null)).toBe(150);
    expect(priceForDurationCzk(undefined)).toBe(150);
  });

  it("pre-picks the longer price for any other length, rather than inventing a tier", () => {
    expect(priceForDurationCzk(120)).toBe(180);
    expect(priceForDurationCzk(75)).toBe(180);
  });
});

describe("gameTakesCredit", () => {
  it("is true only at the credit's own length", () => {
    expect(gameTakesCredit(CREDIT_SEAT_MINUTES)).toBe(true);
    expect(gameTakesCredit(60)).toBe(false);
    expect(gameTakesCredit(120)).toBe(false);
    expect(gameTakesCredit(null)).toBe(false);
  });
});

describe("the credit nominal and the 90-minute price", () => {
  it("agree today, and are separate facts", () => {
    /*
     * THEY ARE THE SAME NUMBER AND MUST NOT BECOME THE SAME CONSTANT.
     * `PASS_REFERENCE_PRICE_CZK` is what a credit is worth in the ledger;
     * `priceForDurationCzk(90)` is what a 90-minute game charges a card. This
     * test asserts the coincidence deliberately, so that the day one moves the
     * other is a decision somebody makes rather than a number that follows.
     */
    expect(PASS_REFERENCE_PRICE_CZK).toBe(priceForDurationCzk(CREDIT_SEAT_MINUTES));
  });
});
