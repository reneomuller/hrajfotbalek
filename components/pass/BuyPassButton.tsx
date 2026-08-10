"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { buyPassAction, type PassActionState } from "@/app/pass/actions";
import { describeBookingError } from "@/lib/booking/errors";
import { useStrings } from "@/components/LocaleProvider";

const INITIAL: PassActionState = { status: "idle" };

/**
 * Buy one tier.
 *
 * SIGNED OUT, THE BUTTON STILL SUBMITS. The action redirects to `/login` with
 * the intent attached rather than the button being disabled or hidden — a
 * disabled button on a price list reads as "sold out", and hiding it hides the
 * only thing that explains what the page is for. Same no-pre-auth-hold rule
 * the booking flow follows: walk the whole thing, authenticate at the end.
 */
export function BuyPassButton({
  games,
  label,
  variant = "primary",
  signedIn,
}: {
  games: number;
  label: string;
  /**
   * `quiet` is the pass card's treatment: an outline, compact, not spanning
   * the card. Five cards each carrying a full-width volt button made the
   * control the loudest thing on a page whose job is comparing prices — and
   * made all five look identical at a glance, which is the opposite of what a
   * tier list is for.
   */
  variant?: "primary" | "quiet";
  signedIn: boolean;
}) {
  const t = useStrings();
  const [state, formAction] = useActionState(buyPassAction, INITIAL);

  return (
    <form action={formAction}>
      <input type="hidden" name="games" value={games} />
      <Submit
        label={signedIn ? label : t.booking.logInToClaim}
        games={games}
        variant={variant}
      />

      {state.status === "error" && state.code && (
        <p role="alert" className="mt-2 text-[12px] text-muted">
          {describeBookingError(state.code, t).message}
        </p>
      )}
    </form>
  );
}

function Submit({
  label,
  games,
  variant,
}: {
  label: string;
  games: number;
  variant: "primary" | "quiet";
}) {
  const t = useStrings();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid={`buy-pass-${games}`}
      className={
        variant === "quiet"
          ? "inline-flex min-h-11 items-center justify-center rounded-control border border-hairline-strong px-5 text-body font-semibold text-bone transition-colors hover:border-hairline-volt hover:text-volt disabled:opacity-60"
          : "w-full rounded-control bg-volt px-5 py-3 text-body-lg font-bold text-ink disabled:opacity-60"
      }
    >
      {pending ? t.common.loading : label}
    </button>
  );
}
