import Link from "next/link";
import type { PaymentAttentionRow } from "@/lib/admin/queries";
import { formatCzk, formatGameDateTime } from "@/lib/format";
import { strings } from "@/lib/strings";

/**
 * MONEY WITH NO SEAT, ABOVE EVERYTHING (round 12, item 5c).
 *
 * This list is expected to be empty. That is exactly why it is here and not
 * behind a tab: a queue nobody visits is a queue that grows, and this one
 * holds payments that have already left somebody's account. Nothing on the
 * ordinary day — the page's title line says no payments are waiting — and
 * impossible to miss on the day it is not.
 *
 * WARN, NOT VOLT (round 42). Volt is this product's "on, live, good"; the one
 * colour that asks a human for something is `warn`, the same ink the seat bar
 * gives a seat still owing.
 *
 * NOTHING RESOLVES IT AUTOMATICALLY. A sweep that refunded, or one that moved
 * somebody off a seat to make room, would be the product deciding about a
 * stranger's money. Each row opens the game, where the owner decides.
 */
export function PaymentAttention({ rows }: { rows: PaymentAttentionRow[] }) {
  if (rows.length === 0) return null;

  return (
    <section
      data-testid="payment-attention"
      className="lifted rounded-card border-2 border-warn/50 p-4 sm:p-5"
    >
      <p className="m-0 text-[10px] font-semibold uppercase tracking-eyebrow text-warn">
        {strings.admin.shell.attentionEyebrow}
      </p>
      <h3 className="m-0 mt-1 font-display text-body-lg uppercase tracking-wide text-white">
        {strings.admin.attentionTitle.replace("{n}", String(rows.length))}
      </h3>
      <p className="m-0 mt-1 text-small leading-snug text-muted">{strings.admin.attentionLede}</p>

      <ul className="m-0 mt-3 list-none p-0">
        {rows.map((row) => (
          <li
            key={row.bookingId}
            data-testid="payment-attention-row"
            className="border-t border-hairline first:border-t-0"
          >
            <Link
              href={`/admin/games/${row.gameId}`}
              className="flex items-start justify-between gap-3 py-3 no-underline"
            >
              <div className="min-w-0">
                <div className="truncate text-body font-semibold text-white">
                  {row.nickname} · {row.venue}
                </div>
                <div className="mt-1 text-small text-muted">
                  {formatGameDateTime(row.startsAt)} · {row.seats} {strings.admin.attentionSeats}
                </div>
                <div className="mt-1 text-small text-bone">{row.reason}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-body font-bold tabular-nums text-warn">
                  {formatCzk(row.amountOwedCzk)}
                </span>
                <span aria-hidden className="text-muted">
                  →
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
