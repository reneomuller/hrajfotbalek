import type { Metadata } from "next";
import { ToastFromQuery } from "@/components/ToastFromQuery";
import Link from "next/link";
import { requireCurrentPlayer } from "@/lib/auth/session";
import { getOwnBookingWithGame } from "@/lib/booking/queries";
import { formatCzk, formatGameDateTime } from "@/lib/format";
import { amountDueCzk } from "@/lib/payments/spd";
import { getStrings } from "@/lib/i18n/server";
import { bestDiscountPercent, listPassTiers } from "@/lib/pass/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStrings();
  return { title: t.payment.qrTitle };
}

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
  const t = await getStrings();
  const { id: gameId } = await params;
  const query = await searchParams;

  /*
   * THE GATE, and only the gate. Its return value fed the QR's nickname line
   * (round 13, item 6 removed it); the CALL stays because it is what sends a
   * signed-out visitor to log in before this page reads a booking.
   */
  await requireCurrentPlayer(`/game/${gameId}`);

  const raw = query.booking;
  const bookingId = Array.isArray(raw) ? raw[0] : raw;

  const found = bookingId ? await getOwnBookingWithGame(bookingId) : null;

  if (!found) {
    return (
      <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
        <p className="text-[12px] tracking-[1px] text-faint">
          {t.booking.bookingNotFound}
        </p>
        <Link
          href={`/game/${gameId}`}
          className="mt-6 inline-block text-[11px] uppercase tracking-eyebrow text-volt no-underline"
        >
          {t.booking.backToGame}
        </Link>
      </main>
    );
  }

  const { booking, game } = found;

  // Branch on the DERIVED method the RPC returned, never on what was sent.
  /*
   * The tiers, for the "save up to N %" claim in the insufficient-credits
   * offer. Read here rather than hardcoded so the number cannot drift away
   * from what the pass page actually sells.
   */
  const tiers = await listPassTiers();
  const isCredit = booking.payment_method === "credit";
  const isSeed = booking.payment_method === "seed_free";
  const amountDue = amountDueCzk(booking.price_czk, booking.credit_applied_czk);
  const needsPayment = booking.status === "reserved" && amountDue > 0;

  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
      <div
        data-testid="confirmation"
        data-status={booking.status}
        data-method={booking.payment_method}
      >
        <div className="text-[11px] uppercase tracking-eyebrow text-volt">
          {booking.status === "confirmed"
            ? t.booking.confirmed
            : t.booking.reserved}
        </div>

        <h1 className="mt-3 font-display text-section-title uppercase tracking-wide text-white">
          {game.venue}
        </h1>

        <div className="mt-3 text-[13px] tracking-[1px] text-volt">
          {formatGameDateTime(game.starts_at)}
        </div>

        {/* Instant-confirmed outcomes: nothing to pay, so no payment block. */}
        {(isCredit || isSeed) && (
          <p className="mt-6 rounded-card bg-surface p-5 text-[14px] leading-relaxed text-bone">
            {isSeed ? t.booking.coveredBySeed : t.booking.coveredByCredit}
          </p>
        )}

        {booking.credit_applied_czk > 0 && !isCredit && !isSeed && (
          <div className="mt-6 flex items-baseline justify-between gap-3 border-b border-hairline pb-3">
            <span className="text-[12px] text-muted">
              {t.booking.creditApplied}
            </span>
            <span className="text-[13px] text-volt">
              −{formatCzk(booking.credit_applied_czk)}
            </span>
          </div>
        )}

        {needsPayment && (
          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12px] text-muted">
                {t.booking.amountDue}
              </span>
              <span
                data-testid="amount-due"
                className="font-display text-[32px] leading-none text-volt"
              >
                {formatCzk(amountDue)}
              </span>
            </div>

            {/*
              THE INSUFFICIENT-CREDITS OFFER (§3 screen 4).

              Rendered whenever money is still owed, which is exactly the
              case where the wallet did not cover the game. It is an OFFER
              BESIDE THE QR, never a gate in front of it: the spot is already
              reserved by the time this renders, and the secondary route is
              the payment that was always going to happen.

              A condition, not a figure — no crown shortfall, because a
              shortfall in crowns re-introduces the unit the credits ruling
              removed on the one screen whose job is to teach that a game is
              one credit.
            */}
            <div data-testid="not-enough-credits" className="mt-5 rounded-card bg-surface p-5">
              <p className="m-0 text-body-lg font-semibold text-bone">
                {t.booking.notEnoughCreditsTitle}
              </p>
              <p className="mt-2 mb-0 text-body leading-relaxed text-muted">
                {t.booking.notEnoughCreditsBody.replace(
                  "{percent}",
                  String(bestDiscountPercent(tiers)),
                )}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link
                  href="/pass"
                  data-testid="get-credits"
                  className="inline-flex min-h-11 items-center justify-center rounded-control bg-volt px-5 text-body-lg font-bold text-ink no-underline transition-colors hover:bg-volt-dim"
                >
                  {t.booking.getCredits}
                </Link>
                {/*
                  ~~"Pay by QR for this game", the secondary route beside the
                  offer.~~ REMOVED (round 13, item 6). There is no QR to jump
                  to any more, and an anchor to a section that no longer
                  renders is a link with nowhere to go.
                */}
              </div>
            </div>

            {booking.payment_method === "cash" && (
              <p className="mt-4 rounded-card bg-surface p-4 text-[14px] leading-relaxed text-muted">
                {t.booking.payByCashHint}
              </p>
            )}

            {/*
              ~~The QR, for an unpaid `qr` booking carrying a VS and a non-zero
              amount.~~ REMOVED (round 13, item 6).

              THE RAIL UNDERNEATH IT IS UNTOUCHED. `payment_method = 'qr'`,
              `payment_code` and the whole variable-symbol sequence stay: ruling
              R3 keeps them as the substrate Stripe maps onto, and there are
              live bookings carrying them. What is gone is the CODE ON THE
              SCREEN and every instruction to scan one — the way a player pays
              is now a card or a wallet, through Stripe.
            */}
          </div>
        )}

        {/*
          Calendar download. A plain anchor rather than a Link: this is a file
          download, not a client-side navigation, and prefetching it would be
          a pointless request for an attachment.
        */}
        <a
          href={`/game/${game.id}/ics`}
          data-testid="ics-link"
          className="mt-8 block rounded-control border border-hairline-volt px-6 py-4 text-center text-cta font-extrabold uppercase tracking-wide text-volt no-underline"
        >
          {t.booking.addToCalendar}
        </a>

        <Link
          href={`/game/${game.id}`}
          className="mt-8 inline-block text-[11px] uppercase tracking-eyebrow text-volt no-underline"
        >
          {t.booking.backToGame}
        </Link>
      </div>

      {/* "You're in" — carried here by the redirect `create_booking`'s action
          performs, because a marker rendered from the action's own state can
          be unmounted by the revalidation before anyone sees it. */}
      <ToastFromQuery query={query} />
    </main>
  );
}
