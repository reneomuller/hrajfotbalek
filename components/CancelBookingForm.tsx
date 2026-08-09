"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { cancelBookingAction, type CancelActionState } from "@/app/account/actions";
import { describeBookingError } from "@/lib/booking/errors";
import { useStrings } from "@/components/LocaleProvider";

const INITIAL: CancelActionState = { status: "idle" };

/**
 * §2.5's TEXT variant in the bar, secondary in the panel.
 *
 * Text in the bar because the bar's job there is to say the spot is held; the
 * cancel is the quiet way out, not the thing being offered. 44px minimum
 * target either way (§2.0) — it is the smallest control in the product and the
 * one most often reached for by mistake.
 *
 * Sentence case in both (ruling B), and the label shortens to `Cancel` in the
 * bar: `Cancel my booking` beside `Paid` is a sentence, and the bar is a row.
 */
function SubmitButton({ variant }: { variant: "default" | "bar" }) {
  const t = useStrings();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      data-testid="cancel-booking"
      className={
        variant === "bar"
          ? "flex min-h-11 items-center justify-center px-3 text-body-lg text-muted transition-colors hover:text-bone disabled:opacity-50"
          : "min-h-11 rounded-control border border-hairline-strong px-4 text-body text-muted transition-colors hover:border-hairline-volt disabled:opacity-50"
      }
    >
      {pending
        ? t.common.loading
        : variant === "bar"
          ? t.booking.barCancel
          : t.booking.cancelBooking}
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
export function CancelBookingForm({
  bookingId,
  toastTo,
  variant = "default",
}: {
  bookingId: string;
  /** `bar` is the §2.4 claim bar's holding states — a text button, no note. */
  variant?: "default" | "bar";
  /**
   * Where to land afterwards, so the cancellation toast is rendered by the
   * SERVER on the next request rather than from this component's action state
   * — which `revalidatePath` can unmount before anyone sees it (CLAUDE.md).
   * Omitted, the action returns its state and this renders the inline note,
   * exactly as it did before Phase 16.
   */
  toastTo?: string;
}) {
  const t = useStrings();
  const [state, formAction] = useActionState(cancelBookingAction, INITIAL);

  if (state.status === "cancelled") {
    return (
      <p className="m-0 text-[11px] uppercase tracking-eyebrow text-volt-dim">
        {t.account.cancelSuccess}
      </p>
    );
  }

  return (
    <form
      action={formAction}
      className={variant === "bar" ? "ml-auto shrink-0" : undefined}
      onSubmit={(event) => {
        if (!window.confirm(t.booking.cancelConfirm)) event.preventDefault();
      }}
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      {toastTo && <input type="hidden" name="toastTo" value={toastTo} />}
      <SubmitButton variant={variant} />

      {state.status === "error" && state.code && (
        <p
          data-testid="cancel-error"
          data-error-code={state.code}
          className="mt-2 m-0 text-[12px] leading-snug text-muted"
        >
          {describeBookingError(state.code, t).message}
        </p>
      )}
    </form>
  );
}
