import { describe, expect, it } from "vitest";
import { adminWallet, creditsFromCzk, czkFromCredits, isWholeCredits } from "@/lib/admin/credits";
import { PASS_REFERENCE_PRICE_CZK } from "@/lib/pass/creditPrice";

/**
 * ROUND 31, ITEM 3 — admin counts credits, the ledger keeps crowns.
 */

/*
 * ~~150.~~ THE RATE IS 180 SINCE ROUND 35 v2, and these are written as the
 * CONSTANT rather than as literals wherever the literal would only be restating
 * it. The two that stay literal are the ones whose point IS the number: a
 * balance that does not divide, and the floor.
 */
const RATE = PASS_REFERENCE_PRICE_CZK;

describe("czkFromCredits", () => {
  it("converts whole credits at the ruling's rate", () => {
    expect(czkFromCredits(2)).toBe(2 * RATE);
    expect(czkFromCredits(1)).toBe(RATE);
  });

  it("is the ruling's constant, not a literal of its own", () => {
    /*
     * A SECOND COPY OF 150 IS THE BUG THIS GUARDS. The rate lives in
     * `PASS_REFERENCE_PRICE_CZK` and the whole product divides by it; a
     * hard-coded 150 here would keep passing on the day the price moves.
     */
    expect(czkFromCredits(1)).toBe(PASS_REFERENCE_PRICE_CZK);
    expect(czkFromCredits(7)).toBe(7 * PASS_REFERENCE_PRICE_CZK);
  });
});

describe("creditsFromCzk", () => {
  it("counts whole credits a player can actually spend", () => {
    expect(creditsFromCzk(3 * RATE)).toBe(3);
    expect(creditsFromCzk(RATE)).toBe(1);
    expect(creditsFromCzk(0)).toBe(0);
  });

  it("FLOORS rather than rounds — a part credit buys no game", () => {
    /*
     * 149 CZK is not "one credit". Rounding up states a number the player
     * cannot spend, which is worse than stating a smaller true one.
     */
    expect(creditsFromCzk(RATE - 1)).toBe(0);
    expect(creditsFromCzk(2 * RATE - 1)).toBe(1);
    // A ragged legacy balance, floored to what it can actually buy.
    expect(creditsFromCzk(4460)).toBe(24);
  });

  it("never goes negative", () => {
    expect(creditsFromCzk(-RATE)).toBe(0);
  });
});

describe("isWholeCredits", () => {
  it("recognises a clean balance", () => {
    expect(isWholeCredits(0)).toBe(true);
    expect(isWholeCredits(2 * RATE)).toBe(true);
  });

  it("recognises a balance that does not divide", () => {
    /*
     * ~~"the ragged ones that exist on production today".~~ NONE DO ANY MORE —
     * round 35 v2 zeroed every wallet, which is what closed row 244. These are
     * kept as arithmetic rather than as a census: the function must still be
     * right the first time somebody is granted an odd amount by hand.
     */
    for (const balance of [4460, 110, 50]) {
      expect(isWholeCredits(balance), `${balance} read as clean`).toBe(false);
    }
  });
});

describe("adminWallet", () => {
  it("shows credits alone when the balance divides cleanly", () => {
    expect(adminWallet(3 * RATE)).toEqual({ credits: 3, remainderCzk: null });
    expect(adminWallet(0)).toEqual({ credits: 0, remainderCzk: null });
  });

  it("HANDLES THE RAGGED BALANCE INSTEAD OF ROUNDING A LIE", () => {
    /*
     * The headline is a floor, so the difference is real money the organizer
     * has to be able to see. `remainderCzk` is what the surface prints as
     * subtext — never instead of the credit count, always beside it.
     */
    expect(adminWallet(4460)).toEqual({ credits: 24, remainderCzk: 4460 });
    expect(adminWallet(110)).toEqual({ credits: 0, remainderCzk: 110 });
    expect(adminWallet(50)).toEqual({ credits: 0, remainderCzk: 50 });
  });

  it("round-trips a granted amount back to the credits that were typed", () => {
    for (const credits of [1, 2, 3, 10]) {
      expect(adminWallet(czkFromCredits(credits))).toEqual({ credits, remainderCzk: null });
    }
  });
});
