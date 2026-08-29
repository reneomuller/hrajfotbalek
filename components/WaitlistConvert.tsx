"use client";

import { useActionState } from "react";
import {
  convertWaitlistAction,
  type WaitlistActionState,
} from "@/app/game/[id]/waitlist/actions";
import { describeWaitlistError } from "@/lib/booking/errors";
import { FormError } from "@/components/form/FormError";
import { PendingButton } from "@/components/form/PendingButton";
import { useStrings } from "@/components/LocaleProvider";

const INITIAL: WaitlistActionState = { status: "idle" };


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
  const t = useStrings();
  const [state, formAction] = useActionState(convertWaitlistAction, INITIAL);

  /*
   * THE ERROR NO LONGER REPLACES THE FORM (§2.11).
   *
   * It used to `return` an error card in place of everything, so a player who
   * lost the race lost their payment choice with it — and losing this race is
   * the ORDINARY outcome here, not a fault: everyone on the list is notified
   * at once and one of them taps first. §2.11 puts a form-level block above
   * the submit and leaves the form standing, so the way forward is one tap.
   *
   * `CAPACITY_FULL` still reads as the still-on-the-waitlist copy rather than
   * as a failure, which is what `describeWaitlistError` already encodes.
   */
  const failure =
    state.status === "error" && state.code
      ? describeWaitlistError(state.code, t)
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
            <input type="radio" name="method" value="qr" defaultChecked className="mt-1 accent-volt" />
            <span>
              <span className="block text-body-lg font-semibold text-bone">
                {t.booking.payByQr}
              </span>
              <span className="mt-1 block text-[13px] leading-snug text-muted">
                {t.booking.payByQrHint}
              </span>
            </span>
          </label>

          {/* ~~Cash on the pitch.~~ REMOVED with the rest of it (round 23,
              item 7). A converting waitlister gets the same two ways to pay as
              anybody else — a second place offering a third option is how one
              of them survives a removal. */}
        </div>
      </fieldset>

      {failure && (
        <FormError title={failure.title} message={failure.message} code={state.code} />
      )}

      <PendingButton
        label={t.games.waitlistConvertTitle}
        testId="convert-waitlist"
        className="w-full"
      />
    </form>
  );
}
