"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createBookingAction, type BookingActionState } from "@/app/game/[id]/book/actions";
import { BookingError } from "@/components/BookingError";
import { strings } from "@/lib/strings";

export interface PaymentMethodChoiceProps {
  gameId: string;
  /** Waitlist joins take the same path; only the CTA copy differs. */
  isFull: boolean;
}

const INITIAL: BookingActionState = { status: "idle" };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid="confirm-booking"
      className="mt-6 w-full rounded-cta bg-volt px-6 py-4 font-condensed text-cta font-extrabold uppercase tracking-wide text-surface disabled:opacity-60"
    >
      {pending ? strings.common.loading : label}
    </button>
  );
}

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
export function PaymentMethodChoice({ gameId, isFull }: PaymentMethodChoiceProps) {
  const [state, formAction] = useActionState(createBookingAction, INITIAL);

  if (state.status === "error" && state.code) {
    return <BookingError code={state.code} gameId={gameId} />;
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="gameId" value={gameId} />

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-4 font-condensed text-[17px] font-bold uppercase tracking-wide text-white">
          {strings.booking.choosePayment}
        </legend>

        <div className="flex flex-col gap-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-card border border-hairline bg-surface-card p-4 has-[:checked]:border-hairline-volt">
            <input
              type="radio"
              name="method"
              value="qr"
              defaultChecked
              className="mt-1 accent-volt"
            />
            <span>
              <span className="block font-condensed text-[16px] font-bold uppercase tracking-wide text-bone">
                {strings.booking.payByQr}
              </span>
              <span className="mt-1 block text-[13px] leading-snug text-muted">
                {strings.booking.payByQrHint}
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-card border border-hairline bg-surface-card p-4 has-[:checked]:border-hairline-volt">
            <input type="radio" name="method" value="cash" className="mt-1 accent-volt" />
            <span>
              <span className="block font-condensed text-[16px] font-bold uppercase tracking-wide text-bone">
                {strings.booking.payByCash}
              </span>
              <span className="mt-1 block text-[13px] leading-snug text-muted">
                {strings.booking.payByCashHint}
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <SubmitButton
        label={isFull ? strings.games.joinWaitlist : strings.booking.confirmBooking}
      />
    </form>
  );
}
