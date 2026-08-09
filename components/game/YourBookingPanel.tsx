import Link from "next/link";
import { bookingBadge, type BadgeTone } from "@/lib/booking/badges";
import { formatCzk } from "@/lib/format";
import { getStrings } from "@/lib/i18n/server";
import { shouldRenderQr } from "@/lib/payments/spd";
import type { Database } from "@/lib/types/database";

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];

const TONE_CLASS: Record<BadgeTone, string> = {
  paid: "border-hairline-volt bg-volt/[.08] text-volt",
  pending: "border-hairline-strong text-bone",
  muted: "border-hairline text-faint",
};

/**
 * What the game page shows to someone who is already in the lineup (§5.6).
 *
 * THE PAGE USED TO ASK A PLAYER WHO HAD ALREADY PAID TO CLAIM A SPOT THEY WERE
 * STANDING ON. That reads as a broken page, and the question a holder actually
 * arrives with — *am I in, and have I paid?* — was the one thing it did not
 * answer. This panel answers it, and the claim CTA does not render alongside.
 *
 * The booking reaching this component was resolved SERVER-SIDE from the
 * caller's own row under `bookings_select_own` RLS — never from a nickname
 * match against the public roster, which is display-grade and would let anyone
 * see "their" booking by choosing the right nickname.
 *
 * THE CANCEL IS NOT HERE ANY MORE. v1.3 §2.4 gives it to the claim bar, which
 * carries a control in all seven of its states — so this panel answers "am I
 * in, and have I paid?" and the bar answers "what can I do about it". The
 * `canCancel` prop went with it rather than being left accepted-and-ignored: a
 * component that still takes it is a component someone will pass it to.
 */
export async function YourBookingPanel({ booking }: { booking: BookingRow }) {
  const t = await getStrings();
  const badge = bookingBadge(booking.status, booking.payment_method, t);
  const amountDue = booking.price_czk - booking.credit_applied_czk;
  // The same predicate the confirmation screen uses, so this never links to a
  // page that then decides there is no QR to render.
  const showQr = booking.status === "reserved" && shouldRenderQr(booking);

  return (
    <section
      data-testid="your-booking"
      data-status={booking.status}
      className="mt-6 rounded-card bg-surface p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="m-0 text-[17px] font-bold uppercase tracking-wide text-white">
          {t.games.yourBookingTitle}
        </h2>
        <span
          data-testid="your-booking-badge"
          className={`rounded-pill border px-2 py-1 text-[10px] uppercase tracking-eyebrow ${TONE_CLASS[badge.tone]}`}
        >
          {badge.label}
        </span>
      </div>

      {/* The payment state, in a sentence rather than only as a chip. */}
      <p className="mt-2 text-[14px] leading-relaxed text-bone">
        {booking.status === "confirmed"
          ? t.games.yourBookingConfirmed
          : booking.payment_method === "cash"
            ? t.games.yourBookingCash
            : t.games.yourBookingHeld}
      </p>

      {booking.status === "reserved" && amountDue > 0 && (
        <p className="mt-1 text-[13px] text-muted">{formatCzk(amountDue)}</p>
      )}

      {/*
        THE CANCEL MOVED TO THE CLAIM BAR (§2.4, ruling G) and is deliberately
        NOT repeated here.

        Two `Cancel` buttons on one screen is not redundancy, it is a question:
        a reader who sees the same control twice has to work out whether the
        two do the same thing. The bar is where every state of this page puts
        its control, and the holding states are two of the seven.

        What stays is the PAYMENT, which is a different action with a different
        outcome — and it is the reason this panel exists at all.
      */}
      {showQr && (
        <div className="mt-4">
          <Link
            href={`/game/${booking.game_id}/book/confirmation?booking=${booking.id}`}
            data-testid="your-booking-pay"
            className="inline-flex min-h-11 items-center justify-center rounded-control bg-volt px-5 text-body-lg font-bold text-ink no-underline transition-colors hover:bg-volt-dim"
          >
            {t.games.yourBookingPay}
          </Link>
        </div>
      )}
    </section>
  );
}
