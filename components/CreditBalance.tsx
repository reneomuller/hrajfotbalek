import { formatCzk } from "@/lib/format";
import { getLocale, getStrings } from "@/lib/i18n/server";
import { creditsLabel } from "@/lib/pass/credits";
import { PASS_REFERENCE_PRICE_CZK } from "@/lib/pass/queries";

export interface CreditBalanceProps {
  /** `SUM(delta_czk)` over the player's ledger, computed server-side. */
  balanceCzk: number;
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
export async function CreditBalance({ balanceCzk }: CreditBalanceProps) {
  const t = await getStrings();
  const locale = await getLocale();
  const hasCredit = balanceCzk > 0;
  const credits = Math.floor(Math.max(0, balanceCzk) / PASS_REFERENCE_PRICE_CZK);

  return (
    <section className="rounded-card bg-surface p-5">
      <h2 className="m-0 text-[11px] uppercase tracking-eyebrow text-volt-dim">
        {t.account.creditBalance}
      </h2>

      <div
        data-testid="credit-balance"
        className="mt-2 font-display text-[40px] leading-none text-volt"
      >
        {creditsLabel(credits, locale, t)}
      </div>

      {/* The equivalence, directly under the count it explains. */}
      <p
        data-testid="credit-equivalence"
        className="mt-2 text-body font-semibold text-bone"
      >
        {t.pass.creditEqualsGame}
      </p>

      {/* What the ledger holds, secondary — the figure a player checks a bank
          transfer against. */}
      <p data-testid="credit-balance-czk" className="mt-1 text-small text-muted">
        {formatCzk(balanceCzk)}
      </p>

      <p className="mt-3 text-[13px] leading-snug text-muted">
        {hasCredit ? t.account.creditHint : t.account.creditEmpty}
      </p>
    </section>
  );
}
