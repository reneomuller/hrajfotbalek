"use client";

import { useFormStatus } from "react-dom";

/**
 * §2.5's submit button, with the PENDING state the spec makes universal.
 *
 * "Every `form_submit` renders §2.5's pending state while its action is in
 * flight" — and the state has a precise shape most of this product was not
 * drawing: the fill drops to `volt-dim`, A 16px SPINNER SITS LEFT OF THE
 * LABEL, the LABEL IS UNCHANGED, pointer events are off, and the button is
 * `aria-busy`.
 *
 * THE LABEL STAYING PUT IS THE POINT, and it is what the previous buttons got
 * wrong: they swapped the text for "Loading…", which changes the button's
 * width mid-press. A control that resizes under a thumb already on it is how a
 * second tap lands somewhere else.
 *
 * PENDING IS THE DOUBLE-SUBMIT GUARD, not decoration. `click()` returns as soon
 * as a form is submitted and a server action is cancelled by navigation, so two
 * taps put two `create_booking` calls into the same capacity race. `disabled`
 * stops the second; `pointer-events-none` stops the press registering at all,
 * which beats a disabled button silently eating the tap.
 */
export function PendingButton({
  label,
  testId,
  variant = "primary",
  className = "",
  disabled = false,
}: {
  label: string;
  testId: string;
  variant?: "primary" | "secondary";
  className?: string;
  /**
   * Disabled for a reason OTHER than being in flight — round 7 item 10's
   * "nothing selected yet". Kept separate from `pending` because the two mean
   * different things to a reader: pending is "your tap landed, wait", and this
   * is "there is nothing to submit". They also look different, which is the
   * point: a pending button keeps its volt fill and gains a spinner, and this
   * one goes flat.
   */
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  const base =
    "inline-flex min-h-[52px] items-center justify-center gap-2 rounded-control px-6 text-body-lg font-bold transition-colors";
  const skin =
    variant === "primary"
      ? "bg-volt text-ink hover:bg-volt-dim"
      : "border border-hairline-strong text-bone hover:border-hairline-volt";

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      data-testid={testId}
      data-pending={pending ? "true" : "false"}
      className={`${base} ${skin} ${
        pending ? "pointer-events-none bg-volt-dim opacity-90" : ""
      } ${!pending && disabled ? "cursor-not-allowed opacity-40" : ""} ${className}`}
    >
      {pending && <Spinner />}
      {label}
    </button>
  );
}

/**
 * 16px, and `aria-hidden` — the button already announces itself busy, and a
 * second announcement is a screen reader saying the same thing twice.
 *
 * `motion-reduce:animate-none` for the same reason the grain layer has it: a
 * spinner is decoration that moves. The button still reads as pending through
 * its fill and `aria-busy`, so nothing is lost.
 */
function Spinner() {
  return (
    <span
      aria-hidden
      className="h-4 w-4 shrink-0 animate-spin rounded-pill border-2 border-current border-t-transparent motion-reduce:animate-none"
    />
  );
}
