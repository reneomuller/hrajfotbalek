import { PASS_REFERENCE_PRICE_CZK } from "@/lib/pass/creditPrice";

/**
 * Admin speaks CREDITS; the ledger keeps CROWNS (round 31, item 3).
 *
 * THE RULING IS `1 credit = 1 game = 150 CZK`, and until now the admin panel
 * was the one surface that ignored it: a player reads "3 credits" on their
 * wallet and the organizer granting them typed "450" into a box marked CZK.
 * Two units for one thing, and the translation living in the organizer's head.
 *
 * WHAT MOVES AND WHAT DOES NOT. The DISPLAY and INPUT layer counts credits.
 * `credit_ledger` goes on storing `delta_czk` and stays the accounting truth —
 * it predates the credits ruling, it is append-only, and every existing row,
 * every refund rule and every booking's `credit_applied_czk` is denominated in
 * crowns. Re-denominating a ledger to make a form tidier is how accounting
 * history gets rewritten.
 *
 * THE RAGGED CASE IS HANDLED, NOT HIDDEN, and it is not hypothetical: THREE OF
 * FOUR wallets on production hold a balance that is not a multiple of 150 —
 * 4,460, 110 and 50 CZK — left by arbitrary-CZK grants and adjustments made
 * before this rule existed. Rounding those to "29 credits" would state a
 * number the player cannot spend and the organizer cannot reconcile. So the
 * count is floored and the exact crowns are offered alongside it, for the
 * caller to render as subtext.
 */

/** Whole credits a balance can actually be spent as. Never negative. */
export function creditsFromCzk(balanceCzk: number): number {
  return Math.floor(Math.max(0, balanceCzk) / PASS_REFERENCE_PRICE_CZK);
}

/** What a whole number of credits costs the ledger, in crowns. */
export function czkFromCredits(credits: number): number {
  return Math.round(credits) * PASS_REFERENCE_PRICE_CZK;
}

/**
 * Does this balance divide cleanly into credits?
 *
 * A NEGATIVE BALANCE CANNOT HAPPEN — `grant_credit` floors every wallet at
 * zero under the player's advisory lock — but `false` is the safe answer if
 * one ever did, because it routes to the exact-crowns subtext rather than to a
 * confident credit count.
 */
export function isWholeCredits(balanceCzk: number): boolean {
  return balanceCzk >= 0 && balanceCzk % PASS_REFERENCE_PRICE_CZK === 0;
}

export interface AdminWalletDisplay {
  /** Whole credits, the headline figure — the same number the player sees. */
  credits: number;
  /**
   * The exact crowns, ONLY when they do not divide cleanly.
   *
   * `null` is the common case and means "the credit count says everything".
   * A number here is the subtext the admin surface must print, because the
   * headline is a floor and the difference is real money.
   */
  remainderCzk: number | null;
}

export function adminWallet(balanceCzk: number): AdminWalletDisplay {
  return {
    credits: creditsFromCzk(balanceCzk),
    remainderCzk: isWholeCredits(balanceCzk) ? null : balanceCzk,
  };
}
