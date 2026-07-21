"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  convertWaitlistAction,
  type WaitlistActionState,
} from "@/app/game/[id]/waitlist/actions";
import { describeWaitlistError } from "@/lib/booking/errors";
import { strings } from "@/lib/strings";

const INITIAL: WaitlistActionState = { status: "idle" };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid="convert-waitlist"
      className="mt-6 w-full rounded-cta bg-volt px-6 py-4 font-condensed text-cta font-extrabold uppercase tracking-wide text-surface disabled:opacity-60"
    >
      {pending ? strings.common.loading : label}
    </button>
  );
}

/**
 * Conversion entry point, reached from the waitlist spot-open email.
 *
 * Everyone on the list is notified at once, so several players may land here
 * for the same spot. The race is settled inside `create_booking` — this
 * component's job is to make losing it read as the normal outcome it is,
 * which is why CAPACITY_FULL renders the still-on-the-waitlist copy rather
 * than an error box.
 */
export function WaitlistConvert({ gameId }: { gameId: string }) {
  const [state, formAction] = useActionState(convertWaitlistAction, INITIAL);

  if (state.status === "error" && state.code) {
    const friendly = describeWaitlistError(state.code);
    return (
      <div
        data-testid="waitlist-convert-error"
        data-error-code={state.code}
        className="rounded-card border border-hairline-strong bg-surface-card p-5"
      >
        <div className="font-condensed text-[19px] font-bold uppercase tracking-wide text-white">
          {friendly.title}
        </div>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">{friendly.message}</p>
      </div>
    );
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
            <input type="radio" name="method" value="qr" defaultChecked className="mt-1 accent-volt" />
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

      <SubmitButton label={strings.games.waitlistConvertTitle} />
    </form>
  );
}
