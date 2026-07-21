import Link from "next/link";
import { CancelBookingForm } from "@/components/CancelBookingForm";
import { bookingBadge, type BadgeTone } from "@/lib/booking/badges";
import type { BookingWithGame } from "@/lib/booking/queries";
import { formatCzk, formatGameDateTime } from "@/lib/format";
import { shouldRenderQr } from "@/lib/payments/spd";
import { strings } from "@/lib/strings";

export interface BookingListProps {
  rows: BookingWithGame[];
}

const TONE_CLASS: Record<BadgeTone, string> = {
  paid: "border-hairline-volt bg-volt/[.08] text-volt",
  pending: "border-hairline-strong text-bone",
  muted: "border-hairline text-faint",
};

export function BookingList({ rows }: BookingListProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-hairline bg-surface-card p-6">
        <p className="m-0 font-mono text-[12px] tracking-[1px] text-faint">
          {strings.account.noBookings}
        </p>
        <Link
          href="/games"
          className="mt-4 inline-block font-mono text-[11px] uppercase tracking-eyebrow text-volt no-underline"
        >
          {strings.account.findAGame}
        </Link>
      </div>
    );
  }

  return (
    <ul className="flex list-none flex-col gap-3 p-0" data-testid="booking-list">
      {rows.map(({ booking, game, canCancel: showCancel }) => {
        const badge = bookingBadge(booking.status, booking.payment_method);
        const amountDue = booking.price_czk - booking.credit_applied_czk;
        // Same predicate the confirmation screen uses, so the link never leads
        // to a page that decides there is no QR to show.
        const showQr = booking.status === "reserved" && shouldRenderQr(booking);

        return (
          <li
            key={booking.id}
            data-testid="booking-row"
            data-status={booking.status}
            className="rounded-card border border-hairline bg-surface-card p-5"
          >
            <div className="flex items-baseline justify-between gap-3">
              <Link
                href={`/game/${game.id}`}
                className="font-condensed text-[18px] font-bold uppercase tracking-wide text-white no-underline"
              >
                {game.venue}
              </Link>
              <span
                data-testid="booking-badge"
                className={`shrink-0 rounded-chip border px-[10px] py-1 font-mono text-[10px] uppercase tracking-eyebrow ${TONE_CLASS[badge.tone]}`}
              >
                {badge.label}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="font-mono text-[12px] tracking-[1px] text-volt">
                {formatGameDateTime(game.starts_at)}
              </span>
              {booking.credit_applied_czk > 0 && (
                <span className="font-mono text-[12px] text-muted">
                  {strings.booking.creditApplied} −
                  {formatCzk(booking.credit_applied_czk)}
                </span>
              )}
              {booking.status === "reserved" && amountDue > 0 && (
                <span className="font-mono text-[12px] text-bone">
                  {strings.booking.amountDue} {formatCzk(amountDue)}
                </span>
              )}
            </div>

            {(showCancel || booking.payment_code !== null) && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                {booking.payment_code !== null ? (
                  <span className="font-mono text-[11px] tracking-[1px] text-faint">
                    {strings.payment.variableSymbol} {booking.payment_code}
                  </span>
                ) : (
                  <span />
                )}
                {showCancel && <CancelBookingForm bookingId={booking.id} />}
              </div>
            )}

            {/*
              Back to the QR. A player who closed the confirmation screen has
              otherwise no route to the code they still owe money against. The
              confirmation page is the one place that renders it, and it reads
              the booking back under own-row RLS, so this is a link rather than
              a second QR render site that could drift from the first.
            */}
            {showQr && (
              <Link
                href={`/game/${game.id}/book/confirmation?booking=${booking.id}`}
                data-testid="show-qr"
                className="mt-4 block rounded-control border border-hairline-volt px-4 py-3 text-center font-condensed text-[15px] font-bold uppercase tracking-wide text-volt no-underline"
              >
                {strings.account.showQr}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
