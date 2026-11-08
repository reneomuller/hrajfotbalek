"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  confirmPaymentAction,
  type ConfirmPaymentState,
} from "@/app/admin/games/[id]/actions";
import { PaymentBadge } from "@/components/admin/PaymentBadge";
import type { AdminBookingRow } from "@/lib/admin/queries";
import { formatCzk } from "@/lib/format";
import { strings } from "@/lib/strings";

const INITIAL: ConfirmPaymentState = { status: "idle" };

/**
 * One payment still to confirm: who, what VS, how much, ✓ Paid.
 *
 * THE ≤5s TARGET IS WHY THIS IS SHAPED LIKE THIS. The organizer is reading
 * their banking app and tapping matches, so the tap is one form post with two
 * hidden fields and no intermediate screen. The amount-differs field is
 * collapsed behind a toggle because it is the rare case.
 *
 * ROUND 42: a warn edge, because this is the one row on the page that asks for
 * something — the same colour as the unpaid seats on the seat bar and the map.
 */
export function ConfirmPaymentRow({
  booking,
  gameId,
}: {
  booking: AdminBookingRow;
  gameId: string;
}) {
  const [state, formAction] = useActionState(confirmPaymentAction, INITIAL);
  const [showAmount, setShowAmount] = useState(false);

  return (
    <li
      data-testid="pending-booking"
      data-vs={booking.paymentCode ?? ""}
      className="rounded-card border border-warn/30 bg-surface px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-[160px] flex-1">
          {/* Nickname is player-supplied free text; JSX escapes it. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-body font-bold text-white">{booking.nickname}</span>
            <PaymentBadge status={booking.status} method={booking.paymentMethod} />
          </div>
          <div className="mt-1 font-mono text-[11px] tracking-[1px] text-muted">
            {booking.paymentCode !== null && (
              <>
                {strings.admin.vsLabel} <span className="text-bone">{booking.paymentCode}</span> ·{" "}
              </>
            )}
            {strings.admin.amountDueLabel} <span className="text-warn">{formatCzk(booking.amountDueCzk)}</span>
          </div>
        </div>

        <form action={formAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="bookingId" value={booking.id} />
          <input type="hidden" name="gameId" value={gameId} />
          {showAmount && (
            <label className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-eyebrow text-muted">
                {strings.admin.receivedLabel}
              </span>
              <input
                name="receivedAmount"
                type="number"
                min={0}
                defaultValue={booking.amountDueCzk}
                data-testid="received-amount"
                className="min-h-11 w-[110px] rounded-control border border-hairline-strong bg-surface px-3 py-2 text-[13px] tabular-nums text-bone outline-none focus:border-volt"
              />
            </label>
          )}
          <ConfirmButton showAmount={showAmount} />
        </form>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => setShowAmount((open) => !open)}
          data-testid="amount-differs"
          className="min-h-8 bg-transparent text-[10px] uppercase tracking-eyebrow text-muted transition-colors hover:text-bone"
        >
          {showAmount ? strings.common.close : strings.admin.amountDiffers}
        </button>

        {state.status === "confirmed" && (
          <span data-testid="confirm-result" className="text-[12px] text-volt">
            {state.wasExpired ? strings.admin.expiredCreditedNotice : strings.admin.paymentConfirmed}
            {state.creditIssuedCzk ? (
              <>
                {" "}
                {strings.admin.creditIssuedNotice} {formatCzk(state.creditIssuedCzk)}
              </>
            ) : null}
          </span>
        )}

        {state.status === "underpaid" && (
          <span role="alert" data-testid="underpaid-result" className="text-[12px] text-bone">
            {strings.admin.underpaidNotice} {formatCzk(state.shortfallCzk ?? 0)} — {strings.admin.underpaidHint}
          </span>
        )}

        {state.status === "error" && state.message && (
          <span role="alert" className="text-[12px] text-muted">
            {state.message}
          </span>
        )}
      </div>
    </li>
  );
}

function ConfirmButton({ showAmount }: { showAmount: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid="mark-paid"
      className="min-h-11 rounded-control bg-volt px-5 text-[14px] font-extrabold uppercase tracking-wide text-surface disabled:opacity-60"
    >
      {pending ? strings.common.loading : showAmount ? strings.admin.confirmReceived : strings.admin.markPaid}
    </button>
  );
}
