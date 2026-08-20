"use client";

import { useActionState } from "react";
import { retryPaymentAction, type RetryState } from "@/app/game/[id]/pay/actions";
import { PendingButton } from "@/components/form/PendingButton";
import { useStrings } from "@/components/LocaleProvider";
import { policy } from "@/lib/policy";
import type { OnlinePaymentState } from "@/lib/booking/queries";

const INITIAL: RetryState = { status: "idle" };

/**
 * What the owner of an unsettled ONLINE booking sees on the game page.
 *
 * THE STATE IT DESCRIBES DID NOT EXIST BEFORE ROUND 12. An online booking used
 * to look exactly like an unpaid cash one — "spot held" — while in fact
 * nothing was watching Stripe, so a player who pressed the back arrow was told
 * they had a seat and kept it, unpaid, for good.
 *
 * IT NEVER CLAIMS THE PAYMENT SUCCEEDED. Stripe's redirect lands in the
 * player's browser and the webhook lands on our server; the two race, and the
 * browser one carries no proof. So this panel says what we actually know —
 * "we have not seen it yet" — and the page re-renders as confirmed when the
 * webhook says so.
 *
 * `attention` OFFERS NO BUTTON, and that is the honest shape: money has
 * arrived and there is no seat to give it. A retry would take a second
 * payment for a seat that still does not exist. It is an admin's to resolve
 * and the copy says a person is looking at it.
 *
 * ENGLISH, CZECH AND RUSSIAN — this is a player-facing surface.
 */
export function AwaitingPaymentPanel({
  state,
  bookingId,
  gameId,
  canRetry,
}: {
  state: Exclude<OnlinePaymentState, "none">;
  bookingId: string;
  gameId: string;
  /**
   * Whether a payment link is configured at all. Without one the retry button
   * would be a control with nothing behind it — the same rule as the booking
   * page's online option, applied to the second door into the same flow.
   */
  canRetry: boolean;
}) {
  const t = useStrings();
  const [result, formAction] = useActionState(retryPaymentAction, INITIAL);

  const copy = {
    waiting: {
      title: t.booking.awaitingTitle,
      body: t.booking.awaitingBody.replace(
        "{minutes}",
        String(policy.booking.onlinePaymentMinutes),
      ),
    },
    expired: { title: t.booking.awaitingExpiredTitle, body: t.booking.awaitingExpiredBody },
    attention: { title: t.booking.awaitingAttentionTitle, body: t.booking.awaitingAttentionBody },
  }[state];

  return (
    <section
      data-testid="awaiting-payment"
      data-payment-state={state}
      className="mt-6 rounded-card border-2 border-hairline-volt bg-surface p-5"
    >
      <h2 className="m-0 text-[17px] font-bold uppercase tracking-wide text-white">
        {copy.title}
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-bone">{copy.body}</p>

      {/*
        `gone` is the answer the RPC gives when the seats went while the player
        was away. It is shown INSTEAD of sending them to pay, which is the
        whole reason the retry re-holds the seat before redirecting.
      */}
      {result.status === "gone" && (
        <p role="alert" data-testid="retry-gone" className="mt-3 text-[13px] text-bone">
          {t.booking.awaitingSeatGone}
        </p>
      )}
      {result.status === "error" && (
        <p role="alert" data-testid="retry-error" className="mt-3 text-[13px] text-bone">
          {t.errors.generic}
        </p>
      )}

      {state !== "attention" && canRetry && result.status !== "gone" && (
        <form action={formAction} className="mt-4">
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="gameId" value={gameId} />
          <PendingButton label={t.booking.awaitingRetry} testId="retry-payment" />
        </form>
      )}
    </section>
  );
}
