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
  signedIn,
}: {
  games: number;
  label: string;
  signedIn: boolean;
}) {
  const t = useStrings();
  const [state, formAction] = useActionState(buyPassAction, INITIAL);

  return (
    <form action={formAction}>
      <input type="hidden" name="games" value={games} />
      <Submit label={signedIn ? label : t.booking.logInToClaim} games={games} />

      {state.status === "error" && state.code && (
        <p role="alert" className="mt-2 text-[12px] text-muted">
          {describeBookingError(state.code, t).message}
        </p>
      )}
    </form>
  );
}

function Submit({ label, games }: { label: string; games: number }) {
  const t = useStrings();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid={`buy-pass-${games}`}
      className="w-full rounded-control bg-volt px-5 py-3 font-condensed text-[15px] font-extrabold uppercase tracking-wide text-surface disabled:opacity-60"
    >
      {pending ? t.common.loading : label}
    </button>
  );
}
