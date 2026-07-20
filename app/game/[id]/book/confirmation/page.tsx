import Link from "next/link";
import { QrPayment } from "@/components/QrPayment";
import { requireCurrentPlayer } from "@/lib/auth/session";
import { getOwnBookingWithGame } from "@/lib/booking/queries";
import { formatCzk, formatGameDateTime } from "@/lib/format";
import { amountDueCzk, paymentIban, shouldRenderQr } from "@/lib/payments/spd";
import { strings } from "@/lib/strings";

export const dynamic = "force-dynamic";

interface ConfirmationPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Booking confirmation.
 *
 * Everything rendered here is read back off the persisted booking rather than
 * carried through the redirect, so the screen reflects what `create_booking`
 * actually decided. A player whose wallet covered the price sees the confirmed
 * state and no payment instruction even though they picked QR — the derived
 * `payment_method` is the authority, not the choice they made.
 */
export default async function ConfirmationPage({
  params,
  searchParams,
}: ConfirmationPageProps) {
  const { id: gameId } = await params;
  const query = await searchParams;

  const player = await requireCurrentPlayer(`/game/${gameId}`);

  const raw = query.booking;
  const bookingId = Array.isArray(raw) ? raw[0] : raw;

  const found = bookingId ? await getOwnBookingWithGame(bookingId) : null;

  if (!found) {
    return (
      <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
        <p className="font-mono text-[12px] tracking-[1px] text-faint">
          {strings.booking.bookingNotFound}
        </p>
        <Link
          href={`/game/${gameId}`}
          className="mt-6 inline-block font-mono text-[11px] uppercase tracking-eyebrow text-volt no-underline"
        >
          {strings.booking.backToGame}
        </Link>
      </main>
    );
  }

  const { booking, game } = found;

  // Branch on the DERIVED method the RPC returned, never on what was sent.
  const isCredit = booking.payment_method === "credit";
  const isSeed = booking.payment_method === "seed_free";
  const amountDue = amountDueCzk(booking.price_czk, booking.credit_applied_czk);
  const needsPayment = booking.status === "reserved" && amountDue > 0;
  const showQr = booking.status === "reserved" && shouldRenderQr(booking);

  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
      <div
        data-testid="confirmation"
        data-status={booking.status}
        data-method={booking.payment_method}
      >
        <div className="font-mono text-[11px] uppercase tracking-eyebrow text-volt">
          {booking.status === "confirmed"
            ? strings.booking.confirmed
            : strings.booking.reserved}
        </div>

        <h1 className="mt-3 font-display text-section-title uppercase tracking-wide text-white">
          {game.venue}
        </h1>

        <div className="mt-3 font-mono text-[13px] tracking-[1px] text-volt">
          {formatGameDateTime(game.starts_at)}
        </div>

        {/* Instant-confirmed outcomes: nothing to pay, so no payment block. */}
        {(isCredit || isSeed) && (
          <p className="mt-6 rounded-card border border-hairline-volt bg-surface-card p-5 text-[14px] leading-relaxed text-bone">
            {isSeed ? strings.booking.coveredBySeed : strings.booking.coveredByCredit}
          </p>
        )}

        {booking.credit_applied_czk > 0 && !isCredit && !isSeed && (
          <div className="mt-6 flex items-baseline justify-between gap-3 border-b border-hairline pb-3">
            <span className="font-mono text-[12px] text-muted">
              {strings.booking.creditApplied}
            </span>
            <span className="font-mono text-[13px] text-volt">
              −{formatCzk(booking.credit_applied_czk)}
            </span>
          </div>
        )}

        {needsPayment && (
          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-[12px] text-muted">
                {strings.booking.amountDue}
              </span>
              <span
                data-testid="amount-due"
                className="font-display text-[32px] leading-none text-volt"
              >
                {formatCzk(amountDue)}
              </span>
            </div>

            {booking.payment_method === "cash" && (
              <p className="mt-4 rounded-card border border-hairline bg-surface-card p-4 text-[14px] leading-relaxed text-muted">
                {strings.booking.payByCashHint}
              </p>
            )}

            {/*
              The QR renders only for an unpaid `qr` booking carrying a VS and
              a non-zero amount — `shouldRenderQr` owns that decision so the
              suppression rules live next to the string builder they guard.
            */}
            {showQr && (
              <div className="mt-4">
                <QrPayment
                  iban={paymentIban()}
                  amountCzk={amountDue}
                  variableSymbol={booking.payment_code!}
                  nickname={player.nickname}
                />
              </div>
            )}
          </div>
        )}

        {/*
          ================= PHASE 13 SLOT — .ics DOWNLOAD =================
          The "Add to calendar" link to /game/[id]/ics renders here.
          =================================================================
        */}

        <Link
          href={`/game/${game.id}`}
          className="mt-8 inline-block font-mono text-[11px] uppercase tracking-eyebrow text-volt no-underline"
        >
          {strings.booking.backToGame}
        </Link>
      </div>
    </main>
  );
}
