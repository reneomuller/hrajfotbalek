"use client";

import { useActionState, useState } from "react";
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
 * The payment choice: ONLINE or CASH, then one Confirm.
 *
 * ROUND 7, ITEM 10 — AND IT IS RULING R3 ARRIVING. R3 retired QR from the
 * redesigned UI and said the backend rails must not be touched, because they
 * are the substrate Stripe maps onto. Both halves hold here: the player sees
 * "Online payment", and what the server books is the existing unpaid QR rail
 * with its variable symbol, untouched and simply not shown.
 *
 * ONLINE IS A PLACEHOLDER, AND IT IS AN HONEST ONE. There is no Stripe
 * integration. `NEXT_PUBLIC_STRIPE_PAYMENT_URL` is the entire activation: set
 * it and choosing this option books the spot unpaid and hands the player to
 * that URL; leave it empty and the option renders fully styled, marked "Coming
 * soon", and CANNOT BE SELECTED.
 *
 * NOTHING IS PRESELECTED, which is the other half of "never pressable with a
 * dead path behind it". The previous version defaulted to QR, so a player
 * could press Confirm without having made a choice at all. Confirm is disabled
 * until an option is chosen, and the online option cannot be the chosen one
 * while its URL is empty — so there is no arrangement of clicks that submits a
 * method with nothing behind it.
 *
 * CREDIT STILL WINS FIRST, and these options do not mention it. `credit` and
 * `seed_free` are OUTCOMES `create_booking` derives under its own locks; a
 * player with a full wallet picks either option here and gets `credit` back
 * from the RPC. Predicting that from a balance this component does not hold
 * would be predicting it from a stale number. Nothing here blocks a booking to
 * upsell, and nothing here offers a pass.
 */
export function PaymentMethodChoice({ gameId }: PaymentMethodChoiceProps) {
  const t = useStrings();
  const [state, formAction] = useActionState(createBookingAction, INITIAL);

  /*
   * Build-time inline, like every `NEXT_PUBLIC_*`. Read here rather than
   * passed from the server so the enabled/disabled state and the redirect
   * cannot disagree — the action reads the same variable.
   */
  const onlineReady = Boolean(process.env.NEXT_PUBLIC_STRIPE_PAYMENT_URL);
  const [choice, setChoice] = useState<"online" | "cash" | null>(null);

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

  const optionClass = (value: "online" | "cash", disabled: boolean) =>
    [
      "flex items-start gap-3 rounded-card border-2 p-4 transition-colors",
      disabled
        ? "cursor-not-allowed border-hairline bg-surface/60 opacity-60"
        : "cursor-pointer bg-surface " +
          (choice === value ? "border-volt" : "border-hairline-strong hover:border-hairline-volt"),
    ].join(" ");

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="gameId" value={gameId} />

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-4 text-body-lg font-semibold text-bone">
          {t.booking.choosePayment}
        </legend>

        <div className="flex flex-col gap-3">
          {/* ---- online ------------------------------------------------- */}
          <label data-testid="pay-online" className={optionClass("online", !onlineReady)}>
            <input
              type="radio"
              name="option"
              value="online"
              disabled={!onlineReady}
              checked={choice === "online"}
              onChange={() => setChoice("online")}
              data-testid="pay-online-input"
              className="mt-1 accent-volt"
            />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-body-lg font-semibold text-bone">
                  {t.booking.payOnline}
                </span>
                {/*
                  The badge is the whole honesty of this control. Fully styled
                  and visibly not yet available beats a hidden option — a
                  player who has heard card payment is coming can see that it
                  is, rather than concluding it was removed.
                */}
                {!onlineReady && (
                  <span
                    data-testid="pay-online-soon"
                    className="rounded-pill border border-hairline-strong px-2 py-[2px] text-eyebrow font-semibold uppercase text-muted"
                  >
                    {t.booking.payOnlineComingSoon}
                  </span>
                )}
              </span>
              <span className="mt-1 block text-[13px] leading-snug text-muted">
                {t.booking.payOnlineHint}
              </span>
            </span>
          </label>

          {/* ---- cash --------------------------------------------------- */}
          <label data-testid="pay-cash" className={optionClass("cash", false)}>
            <input
              type="radio"
              name="option"
              value="cash"
              checked={choice === "cash"}
              onChange={() => setChoice("cash")}
              data-testid="pay-cash-input"
              className="mt-1 accent-volt"
            />
            <span className="min-w-0">
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
        disabled={choice === null}
      />
    </form>
  );
}
