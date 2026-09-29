"use client";

import { useActionState, useState } from "react";
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
  configured,
}: {
  games: number;
  label: string;
  /**
   * Whether THIS TIER has a Stripe link (round 13, item 7).
   *
   * A tier without one cannot be sold: its price is discounted, so it can
   * never fall back to the single-game link — even at the right quantity that
   * charges the undiscounted price. The button says "Coming soon" and does not
   * submit, which is the same honesty the booking page's online option shows
   * when its URL is unset.
   */
  configured: boolean;
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
  // Shown only for an unconfigured tier, and only after a press.
  const [notice, setNotice] = useState(false);

  /*
   * ~~A grey "Coming soon" chip when the tier has no link.~~ ROUND 14 ITEM 7:
   * THE BUTTON IS VISUALLY FINAL EITHER WAY.
   *
   * The price list is the page's product. A column of grey disabled chips
   * reads as "this is not a real product yet", and the owner will be turning
   * these on by pasting a JSON map into Vercel — a change that must be
   * INVISIBLE on the page, because nothing about the page is what changed.
   *
   * SO IT IS THE SAME VOLT PILL IN BOTH STATES. Unconfigured, pressing it
   * shows one brief line and does nothing else — no navigation, no row
   * written, no half-finished purchase left behind. `buyPassAction` refuses
   * before it writes anything, so this is the same answer the server gives,
   * shown without the round trip.
   *
   * THIS IS NOT A DEAD AFFORDANCE in the sense round 7 forbade. That rule was
   * about a control with NOTHING behind it and no explanation — a Google
   * button that could sign nobody in. This one tells you exactly what is
   * happening and when it will work.
   */
  if (!configured) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setNotice(true)}
          data-testid={`buy-pass-${games}`}
          data-configured="false"
          className={
            variant === "quiet"
              ? "inline-flex min-h-11 items-center justify-center rounded-pill border-2 border-volt px-5 text-small font-bold uppercase tracking-wide text-volt transition-colors hover:bg-volt/10"
              : "inline-flex min-h-11 w-full items-center justify-center rounded-control bg-volt px-5 text-body-lg font-bold text-ink transition-colors hover:bg-volt-dim"
          }
        >
          {signedIn ? label : t.booking.logInToClaim}
        </button>
        {notice && (
          <p role="status" data-testid="pass-soon-notice" className="mt-2 text-[12px] text-muted">
            {t.pass.paymentsSoon}
          </p>
        )}
      </div>
    );
  }

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
          ? /*
               VOLT TEXT AND A VOLT OUTLINE, at rest rather than on hover.

               It was bone text inside a `hairline-strong` box that only turned
               volt when a pointer was over it — which on a phone is never. The
               one control on a price card read as the quietest thing on it,
               and "quiet" was meant to keep it from outshouting the per-game
               price, not to make it disappear.

               `border-volt` at full strength rather than `hairline-volt` (.30):
               this is the control, and .30 on `surface-raised` computes to
               roughly 2.4:1, under the 3:1 WCAG 1.4.11 asks of a non-text
               boundary. The hover state deepens the fill instead of changing
               the colour, so nothing about the button moves on hover.
            */
            "inline-flex min-h-11 items-center justify-center rounded-control border border-volt bg-volt/[.08] px-5 text-body font-semibold text-volt transition-colors hover:bg-volt/[.16] disabled:opacity-60"
          : "w-full rounded-control bg-volt px-5 py-3 text-body-lg font-bold text-ink disabled:opacity-60"
      }
    >
      {pending ? t.common.loading : label}
    </button>
  );
}
