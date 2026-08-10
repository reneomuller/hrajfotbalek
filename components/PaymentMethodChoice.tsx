"use client";

import { useActionState } from "react";
import { createBookingAction, type BookingActionState } from "@/app/game/[id]/book/actions";
import { FormError } from "@/components/form/FormError";
import { PendingButton } from "@/components/form/PendingButton";
import { describeBookingError } from "@/lib/booking/errors";
import { useStrings } from "@/components/LocaleProvider";
import Link from "next/link";

export interface PaymentMethodChoiceProps {
  gameId: string;
}

const INITIAL: BookingActionState = { status: "idle" };


/**
 * QR-vs-cash choice.
 *
 * These two are the ONLY values the UI ever sends. `credit` and `seed_free`
 * are derived inside `create_booking` — a player with a full wallet still
 * picks QR here and gets `credit` back from the RPC, which is what the
 * confirmation screen branches on. Offering a "pay with credit" option would
 * mean predicting the outcome from a balance this component does not have and
 * could not trust.
 */
export function PaymentMethodChoice({ gameId }: PaymentMethodChoiceProps) {
  const t = useStrings();
  const [state, formAction] = useActionState(createBookingAction, INITIAL);

  /*
   * THE ERROR NO LONGER REPLACES THE FORM (§2.11).
   *
   * It used to `return <BookingError/>` in place of everything, so a player
   * who lost a capacity race lost their payment choice with it and had to
   * start again from the game page. A race is the commonest failure here and
   * the least deserving of that: someone simply tapped first. The block sits
   * above the button, the form stands, and trying again is one tap.
   */
  const failure =
    state.status === "error" && state.code
      ? describeBookingError(state.code, t)
      : null;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="gameId" value={gameId} />

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-4 text-body-lg font-semibold text-bone">
          {t.booking.choosePayment}
        </legend>

        <div className="flex flex-col gap-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-card bg-surface p-4 has-[:checked]:border-hairline-volt">
            <input
              type="radio"
              name="method"
              value="qr"
              defaultChecked
              className="mt-1 accent-volt"
            />
            <span>
              <span className="block text-body-lg font-semibold text-bone">
                {t.booking.payByQr}
              </span>
              <span className="mt-1 block text-[13px] leading-snug text-muted">
                {t.booking.payByQrHint}
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-card bg-surface p-4 has-[:checked]:border-hairline-volt">
            <input type="radio" name="method" value="cash" className="mt-1 accent-volt" />
            <span>
              <span className="block text-body-lg font-semibold text-bone">
                {t.booking.payByCash}
              </span>
              <span className="mt-1 block text-[13px] leading-snug text-muted">
                {t.booking.payByCashHint}
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      {failure && (
        <FormError title={failure.title} message={failure.message} code={state.code}>
          {/*
            The way forward §2.11 asks for. Retrying is the button below, so
            this is the OTHER exit — back to the game, which is where a player
            goes when the answer is "this one is gone".
          */}
          <Link
            href={`/game/${gameId}`}
            data-testid="booking-error-back"
            className="text-body font-semibold text-volt no-underline"
          >
            {t.booking.backToGame}
          </Link>
        </FormError>
      )}

      <PendingButton
        label={t.booking.confirmBooking}
        testId="confirm-booking"
        className="w-full"
      />
    </form>
  );
}
