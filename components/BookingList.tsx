import Link from "next/link";
import { CancelBookingForm } from "@/components/CancelBookingForm";
import { EmptyState } from "@/components/EmptyState";
import { bookingBadge, type BadgeTone } from "@/lib/booking/badges";
import type { BookingWithGame } from "@/lib/booking/queries";
import { policy } from "@/lib/policy";
import { formatCzk, formatGameDateTime } from "@/lib/format";
import { shouldRenderQr } from "@/lib/payments/spd";
import { getStrings } from "@/lib/i18n/server";

export interface BookingListProps {
  rows: BookingWithGame[];
}

const TONE_CLASS: Record<BadgeTone, string> = {
  paid: "border-hairline-volt bg-volt/[.08] text-volt",
  pending: "border-hairline-strong text-bone",
  muted: "border-hairline text-faint",
};

export async function BookingList({ rows }: BookingListProps) {
  const t = await getStrings();
  if (rows.length === 0) {
    return (
      <EmptyState
        title={t.account.noBookingsTitle}
        body={t.account.noBookingsBody}
        ctaLabel={t.account.findAGame}
        ctaHref="/games"
      />
    );
  }

  return (
    <ul className="flex list-none flex-col gap-3 p-0" data-testid="booking-list">
      {rows.map(({ booking, game, canCancel: showCancel, refundable }) => {
        const badge = bookingBadge(booking.status, booking.payment_method, t);
        const amountDue = booking.price_czk - booking.credit_applied_czk;
        // Same predicate the confirmation screen uses, so the link never leads
        // to a page that decides there is no QR to show.
        const showQr = booking.status === "reserved" && shouldRenderQr(booking);

        return (
          <li
            key={booking.id}
            data-testid="booking-row"
            data-status={booking.status}
            className="rounded-card bg-surface p-5"
          >
            <div className="flex items-baseline justify-between gap-3">
              <Link
                href={`/game/${game.id}`}
                className="text-[18px] font-bold uppercase tracking-wide text-white no-underline"
              >
                {game.venue}
              </Link>
              <span
                data-testid="booking-badge"
                className={`shrink-0 rounded-pill border px-[10px] py-1 text-[10px] uppercase tracking-eyebrow ${TONE_CLASS[badge.tone]}`}
              >
                {badge.label}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-[12px] tracking-[1px] text-volt">
                {formatGameDateTime(game.starts_at)}
              </span>
              {/*
                ~~`Credit applied −150 CZK`~~ REMOVED (round 13, item 9).

                It answered a question nobody asks about a game they are ABOUT
                to play. The row already carries the badge that says the
                booking is settled; how it was settled is history, and it is on
                the confirmation screen and in the wallet where history
                belongs. What stays is `amountDue`, which is the one number on
                this row that asks the reader to do something.
              */}
              {booking.status === "reserved" && amountDue > 0 && (
                <span className="text-[12px] text-bone">
                  {t.booking.amountDue} {formatCzk(amountDue)}
                </span>
              )}
            </div>

            {(showCancel || booking.payment_code !== null) && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                {booking.payment_code !== null ? (
                  <span className="text-[11px] tracking-[1px] text-faint">
                    {t.payment.variableSymbol} {booking.payment_code}
                  </span>
                ) : (
                  <span />
                )}
                {showCancel && (
                  /* Policy v2 — see the note in ClaimBar: the refundable
                     decision is the server's, not the dialog's. */
                  <CancelBookingForm
                    bookingId={booking.id}
                    toastTo="/account"
                    refundable={refundable}
                    refundCutoffHours={policy.cancellation.refundCutoffHoursBeforeStart}
                  />
                )}
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
                className="mt-4 block rounded-control border border-hairline-volt px-4 py-3 text-center text-[15px] font-bold uppercase tracking-wide text-volt no-underline"
              >
                {t.account.showQr}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
