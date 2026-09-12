import { describe, expect, it } from "vitest";
import { adminWallet, creditsFromCzk, czkFromCredits, isWholeCredits } from "@/lib/admin/credits";
import { PASS_REFERENCE_PRICE_CZK } from "@/lib/pass/creditPrice";

/**
 * ROUND 31, ITEM 3 — admin counts credits, the ledger keeps crowns.
 */

describe("czkFromCredits", () => {
  it("converts whole credits at the ruling's rate", () => {
    // The owner's own acceptance numbers.
    expect(czkFromCredits(2)).toBe(300);
    expect(czkFromCredits(1)).toBe(150);
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
    expect(creditsFromCzk(450)).toBe(3);
    expect(creditsFromCzk(150)).toBe(1);
    expect(creditsFromCzk(0)).toBe(0);
  });

  it("FLOORS rather than rounds — a part credit buys no game", () => {
    /*
     * 149 CZK is not "one credit". Rounding up states a number the player
     * cannot spend, which is worse than stating a smaller true one.
     */
    expect(creditsFromCzk(149)).toBe(0);
    expect(creditsFromCzk(299)).toBe(1);
    expect(creditsFromCzk(4460)).toBe(29);
  });

  it("never goes negative", () => {
    expect(creditsFromCzk(-150)).toBe(0);
  });
});

describe("isWholeCredits", () => {
  it("recognises a clean balance", () => {
    expect(isWholeCredits(0)).toBe(true);
    expect(isWholeCredits(300)).toBe(true);
  });

  it("recognises the ragged ones that exist on production today", () => {
    // 4,460 / 110 / 50 — arbitrary-CZK grants made before the credits ruling.
    for (const balance of [4460, 110, 50]) {
      expect(isWholeCredits(balance), `${balance} read as clean`).toBe(false);
    }
  });
});

describe("adminWallet", () => {
  it("shows credits alone when the balance divides cleanly", () => {
    expect(adminWallet(450)).toEqual({ credits: 3, remainderCzk: null });
    expect(adminWallet(0)).toEqual({ credits: 0, remainderCzk: null });
  });

  it("HANDLES THE RAGGED BALANCE INSTEAD OF ROUNDING A LIE", () => {
    /*
     * The headline is a floor, so the difference is real money the organizer
     * has to be able to see. `remainderCzk` is what the surface prints as
     * subtext — never instead of the credit count, always beside it.
     */
    expect(adminWallet(4460)).toEqual({ credits: 29, remainderCzk: 4460 });
    expect(adminWallet(110)).toEqual({ credits: 0, remainderCzk: 110 });
    expect(adminWallet(50)).toEqual({ credits: 0, remainderCzk: 50 });
  });

  it("round-trips a granted amount back to the credits that were typed", () => {
    for (const credits of [1, 2, 3, 10]) {
      expect(adminWallet(czkFromCredits(credits))).toEqual({ credits, remainderCzk: null });
    }
  });
});
