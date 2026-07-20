import { formatCzk } from "@/lib/format";
import { strings } from "@/lib/strings";

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
export function CreditBalance({ balanceCzk }: CreditBalanceProps) {
  const hasCredit = balanceCzk > 0;

  return (
    <section className="rounded-card border border-hairline-volt bg-surface-card p-5">
      <h2 className="m-0 font-mono text-[11px] uppercase tracking-eyebrow text-volt-dim">
        {strings.account.creditBalance}
      </h2>

      <div
        data-testid="credit-balance"
        className="mt-2 font-display text-[40px] leading-none text-volt"
      >
        {formatCzk(balanceCzk)}
      </div>

      <p className="mt-3 text-[13px] leading-snug text-muted">
        {hasCredit ? strings.account.creditHint : strings.account.creditEmpty}
      </p>
    </section>
  );
}
