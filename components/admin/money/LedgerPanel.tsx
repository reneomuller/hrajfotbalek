import { ExportCsvLink } from "@/components/admin/ExportCsvLink";
import { Panel } from "@/components/admin/ui/Panel";
import type { Transaction } from "@/lib/admin/financials";
import { formatCzk, formatDate } from "@/lib/format";
import { strings } from "@/lib/strings";

/**
 * The recent Credit ledger, and the transactions export beside it (round 7's
 * `p19` and round 8 item 3, restyled in the round 42 rebuild).
 *
 * THE EXPORT IS NOT THIS LIST. The page shows the last few CREDIT LEDGER
 * movements, because that is the one ordered place a refund, a grant and a
 * redemption sit together; the file is every booking and every top-up,
 * because the columns it carries — method, game/pass reference — belong to a
 * payment rather than to a ledger row. See `app/admin/stats/transactions`.
 */
export function LedgerPanel({ transactions }: { transactions: Transaction[] }) {
  return (
    <Panel
      title={strings.admin.recentTransactions}
      testId="financials-transactions"
      action={<ExportCsvLink href="/admin/stats/transactions" testId="export-transactions" />}
    >
      <p className="-mt-1 mb-2 text-small text-muted">{strings.admin.money.ledgerLede}</p>
      {transactions.length === 0 ? (
        <p className="m-0 mt-3 text-small text-muted">{strings.admin.noTransactions}</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {transactions.map((tx) => (
            <li
              key={tx.id}
              className="flex items-center justify-between gap-3 border-b border-hairline py-3 last:border-b-0 last:pb-0"
            >
              <span className="min-w-0">
                <span className="block truncate text-body font-semibold text-white">{tx.who}</span>
                <span className="block truncate text-small text-muted">
                  {tx.what} <span className="text-faint">· {formatDate(tx.at)}</span>
                </span>
              </span>
              {/* Money in is volt; a Credit spent or expired is muted rather
                  than red — it is not a loss, it is a seat being used. */}
              <span
                className={`shrink-0 whitespace-nowrap text-body font-bold tabular-nums ${
                  tx.amountCzk >= 0 ? "text-volt" : "text-muted"
                }`}
              >
                {tx.amountCzk >= 0 ? "+" : "−"}
                {formatCzk(Math.abs(tx.amountCzk))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
