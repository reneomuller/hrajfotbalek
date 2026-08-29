import { getLocale, getStrings } from "@/lib/i18n/server";
import { CreditBatches } from "@/components/account/CreditBatches";
import type { CreditBatch } from "@/lib/pass/queries";
import { creditsLabel } from "@/lib/pass/credits";
import { PASS_REFERENCE_PRICE_CZK } from "@/lib/pass/queries";

export interface CreditBalanceProps {
  /** `SUM(delta_czk)` over the player's ledger, computed server-side. */
  balanceCzk: number;
  /**
   * The expiring batches, rendered INSIDE this card (round 23, item 3).
   *
   * Defaulted so the one other caller — which has no batches to show — does
   * not have to pass an empty array to say "none".
   */
  batches?: CreditBatch[];
}

/**
 * Wallet balance, counted in CREDITS.
 *
 * The number is computed on the server by summing the player's own
 * `credit_ledger` rows and passed in — this component never fetches or
 * derives it. The ledger is append-only, stores CROWNS, and is the authority;
 * a balance cached or recomputed anywhere else is a second source of truth
 * that can disagree with it, and the one that disagrees is always the wrong
 * one.
 *
 * THE DIVISION IS AUTHORIZED, AND IT IS WHY THIS READS IN CREDITS NOW. The
 * substrate is unchanged — crowns in, crowns out — and the flat-150 ruling is
 * what makes `balance / 150` a fact rather than an estimate. Before that
 * ruling per-game prices could differ, so a credit count would have started
 * owing fractions of a game the moment two games cost differently; that is the
 * exact reasoning that put CZK on this card originally, and the fiat is what
 * dissolved it.
 *
 * FLOORED, NEVER ROUNDED UP, and that survives the change. Telling someone
 * they have five credits when they can pay for four is a promise the booking
 * path will refuse, at the moment they are counting on it.
 *
 * The crowns stay, small, underneath: it is what the ledger actually holds and
 * what a player reconciles against a bank transfer, and dropping it would make
 * a top-up impossible to check.
 */
export async function CreditBalance({ balanceCzk, batches = [] }: CreditBalanceProps) {
  const t = await getStrings();
  const locale = await getLocale();
  const hasCredit = balanceCzk > 0;
  const credits = Math.floor(Math.max(0, balanceCzk) / PASS_REFERENCE_PRICE_CZK);

  return (
    /*
      ONE SECTION, TIGHTER (round 23, item 3). `p-4` rather than `p-5`, a 34px
      figure rather than 40, and the expiry list inside instead of a second
      headed section beneath. The card is the wallet; the expiry is a footnote
      on the number, and it now reads as one.
    */
    <section className="rounded-card bg-surface p-4">
      <h2 className="m-0 text-[11px] uppercase tracking-eyebrow text-volt-dim">
        {t.account.creditBalance}
      </h2>

      <div
        data-testid="credit-balance"
        className="mt-1 font-display text-[34px] leading-none text-volt"
      >
        {creditsLabel(credits, locale, t)}
      </div>

      {/* The equivalence, directly under the count it explains. */}
      <p
        data-testid="credit-equivalence"
        className="mt-1 text-body font-semibold text-bone"
      >
        {t.pass.creditEqualsGame}
      </p>

      {/*
        NO CZK FIGURE HERE ANY MORE.

        It was added as the number a player reconciles a bank transfer
        against, and that argument does not survive the wallet being credits:
        the count above and "1 credit = 1 game" carry the whole meaning, and a
        crown figure underneath re-introduces the unit the ruling removed —
        on the one screen whose job is to say what a credit is.

        Reconciliation has a better home anyway: `/account/topup/[id]` shows
        the exact amount and the variable symbol for the payment being
        matched, which is the screen someone actually has open beside their
        banking app.
      */}
      <p className="mt-2 text-[13px] leading-snug text-muted">
        {hasCredit ? t.account.creditHint : t.account.creditEmpty}
      </p>

      {/* The expiry, in the card whose number it qualifies. */}
      <CreditBatches batches={batches} />
    </section>
  );
}
