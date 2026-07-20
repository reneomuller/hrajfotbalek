"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { cancelBookingAction, type CancelActionState } from "@/app/account/actions";
import { describeBookingError } from "@/lib/booking/errors";
import { strings } from "@/lib/strings";

const INITIAL: CancelActionState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid="cancel-booking"
      className="rounded-control border border-hairline-strong px-4 py-2 font-mono text-[11px] uppercase tracking-eyebrow text-muted disabled:opacity-50"
    >
      {pending ? strings.common.loading : strings.booking.cancelBooking}
    </button>
  );
}

/**
 * Self-cancel control.
 *
 * The confirmation prompt is deliberate: cancelling returns value as wallet
 * credit rather than money, so it is not a fully reversible action from the
 * player's point of view and should not be one tap away by accident.
 */
export function CancelBookingForm({ bookingId }: { bookingId: string }) {
  const [state, formAction] = useActionState(cancelBookingAction, INITIAL);

  if (state.status === "cancelled") {
    return (
      <p className="m-0 font-mono text-[11px] uppercase tracking-eyebrow text-volt-dim">
        {strings.account.cancelSuccess}
      </p>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(strings.booking.cancelConfirm)) event.preventDefault();
      }}
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <SubmitButton />

      {state.status === "error" && state.code && (
        <p
          data-testid="cancel-error"
          data-error-code={state.code}
          className="mt-2 m-0 text-[12px] leading-snug text-muted"
        >
          {describeBookingError(state.code).message}
        </p>
      )}
    </form>
  );
}
