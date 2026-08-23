import { PASS_REFERENCE_PRICE_CZK } from "@/lib/pass/creditPrice";
import { createServerSupabaseClient } from "@/lib/supabase/clients";

/**
 * Reads for the game pass (§4.2).
 *
 * The tiers are anon-readable — the pass panel sits on the games list, which a
 * signed-out visitor reaches from a shared link — and the batches are read
 * through `my_credit_batches()`, which takes no argument and answers only
 * about the caller. Its player-id sibling `credit_batches()` is service-role
 * only, deliberately: a function that takes a player id and bypasses the
 * ledger's own-row RLS must not be handed to sessions.
 */

export interface PassTier {
  games: number;
  priceCzk: number;
  creditedCzk: number;
  /** Null = never expires. Only the 1-game tier. */
  expiresMonths: number | null;
  /** What one game works out at. The number the offer is actually judged on. */
  perGameCzk: number;
  /** `creditedCzk - priceCzk`. Zero on the 1-game tier, and that is the point. */
  savingCzk: number;
}

export interface CreditBatch {
  batchId: string;
  originalCzk: number;
  remainingCzk: number;
  expiresAt: string;
}

export async function listPassTiers(): Promise<PassTier[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("pass_tiers")
    .select("games, price_czk, credited_czk, expires_months")
    .order("games", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    games: row.games,
    priceCzk: row.price_czk,
    creditedCzk: row.credited_czk,
    expiresMonths: row.expires_months,
    // Rounded to a whole crown for display. Every current tier divides
    // exactly; the rounding is here so a future one that does not cannot
    // render "139.99999".
    perGameCzk: Math.round(row.price_czk / row.games),
    savingCzk: row.credited_czk - row.price_czk,
  }));
}

/**
 * The caller's own expiring batches, soonest first.
 *
 * Returns an empty list for a signed-out visitor, which is the right answer
 * rather than an error: `my_credit_batches()` resolves the player from the
 * session and finds none.
 */
export async function listMyBatches(): Promise<CreditBatch[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc("my_credit_batches");
  if (error || !data) return [];

  return data
    // A spent-out batch is history, and the account page is answering "what
    // have I got" rather than "what did I have".
    .filter((row) => row.remaining_czk > 0)
    .map((row) => ({
      batchId: row.batch_id,
      originalCzk: row.original_czk,
      remainingCzk: row.remaining_czk,
      expiresAt: row.expires_at,
    }));
}

/**
 * The reference price the tiers are built on.
 *
 * NOT A PRICE ANYONE IS EVER CHARGED — `games.price_czk` is the only thing the
 * booking path reads. This exists so "≈ 5 games" can be computed, and it is
 * exported so the number appears once rather than in each caller.
 */
/*
 * RE-EXPORTED, NOT DEFINED HERE (round 16, item 20). It moved to
 * `lib/pass/creditPrice.ts` because this module opens a server Supabase client
 * — so a CLIENT component importing the constant from here dragged
 * `next/headers` across the boundary. Existing callers are unchanged.
 */
export { PASS_REFERENCE_PRICE_CZK };

/**
 * The tier the pass page tags "Most popular".
 *
 * A RULING, not a measurement — nothing counts purchases per tier yet, and a
 * tag that claims to be data while being a constant is worse than one that is
 * openly a recommendation. Named here rather than compared inline so the day
 * it becomes a real number, there is one place to change.
 */
export const MOST_POPULAR_GAMES = 12;

/**
 * The best discount any tier offers, as a whole percent, floored.
 *
 * COMPUTED FROM THE TIERS, never written down. The insufficient-credits state
 * claims "save up to N %", and a hardcoded number drifts the first time a tier
 * price moves — a stale discount claim is a promise the pass page does not
 * keep, on the one screen that is asking someone to spend money.
 *
 * FLOORED, not rounded: claiming 23 % when the true figure is 23.3 % is
 * conservative, and claiming 24 % when it is 23.6 % would not be. The anchor
 * is `games x 150`, the same reference the tier cards strike through.
 */
export function bestDiscountPercent(tiers: PassTier[]): number {
  const best = tiers.reduce((max, tier) => {
    const anchor = tier.games * PASS_REFERENCE_PRICE_CZK;
    if (anchor <= 0) return max;
    return Math.max(max, ((anchor - tier.priceCzk) / anchor) * 100);
  }, 0);
  return Math.floor(best);
}

/**
 * "≈ 5 games" for an amount of credit.
 *
 * THE GAMES-EQUIVALENT IS THE WHOLE REASON CZK WORKS AS THE UNIT (§4.2).
 * Unit-credits were rejected because per-game pricing varies — a "5 games"
 * balance starts owing fractions of a game the moment two games cost
 * differently. CZK with an approximate games count gives the same mental model
 * without lying about what is stored, and the "≈" is doing real work: it says
 * this is a guide, not a promise.
 *
 * Floored, never rounded up. Telling someone they have five games left when
 * they have four and a half is the one direction this must not err in.
 */
export function gamesEquivalent(amountCzk: number): number {
  return Math.floor(Math.max(0, amountCzk) / PASS_REFERENCE_PRICE_CZK);
}
