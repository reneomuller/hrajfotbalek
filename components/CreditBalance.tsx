import { formatCzk } from "@/lib/format";
import { getStrings } from "@/lib/i18n/server";

export interface CreditBalanceProps {
  /** `SUM(delta_czk)` over the player's ledger, computed server-side. */
  balanceCzk: number;
}

/**
 * Wallet balance.
 *
 * The number is computed on the server by summing the player's own
 * `credit_ledger` rows and passed in — this component never fetches or
 * derives it. The ledger is append-only and is the authority; a balance
 * cached or recomputed anywhere else is a second source of truth that can
 * disagree with it, and the one that disagrees is always the wrong one.
 */
export async function CreditBalance({ balanceCzk }: CreditBalanceProps) {
  const t = await getStrings();
  const hasCredit = balanceCzk > 0;

  return (
    <section className="rounded-card bg-surface p-5">
      <h2 className="m-0 text-[11px] uppercase tracking-eyebrow text-volt-dim">
        {t.account.creditBalance}
      </h2>

      <div
        data-testid="credit-balance"
        className="mt-2 font-display text-[40px] leading-none text-volt"
      >
        {formatCzk(balanceCzk)}
      </div>

      {/*
        THE EQUIVALENCE, on the wallet as well as on the pass page — the two
        surfaces where a credit is counted, so the two surfaces that have to
        say what one is.

        THE FIGURE ABOVE IS STILL CZK, deliberately. Ruling F wants credits as
        the headline with crowns beneath, and turning this into a credit count
        means dividing the ledger balance by the reference price — arithmetic
        on money, which is the pass-page ruling's territory and is parked. The
        line below is the copy half of that ruling and is safe to land now; the
        conversion is not, and inventing it here is exactly the pro-rating the
        ruling says to stop and ask about.
      */}
      <p
        data-testid="credit-equivalence"
        className="mt-2 text-body font-semibold text-bone"
      >
        {t.pass.creditEqualsGame}
      </p>

      <p className="mt-3 text-[13px] leading-snug text-muted">
        {hasCredit ? t.account.creditHint : t.account.creditEmpty}
      </p>
    </section>
  );
}
