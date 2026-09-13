"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useLocale, useStrings } from "@/components/LocaleProvider";
import { cancelGuestsAction } from "@/app/game/[id]/cancel-guests/actions";
import { GuestCountPicker } from "@/components/game/GuestCountPicker";
import { CANCEL_GUESTS_INITIAL } from "@/lib/booking/cancelGuests";
import { pluralise } from "@/lib/i18n/plural";

/**
 * REMOVE GUESTS FROM YOUR OWN BOOKING (round 34, item 4).
 *
 * IT NEVER CANCELS THE PLAYER'S OWN SPOT, and that is a property of the control
 * as well as of the RPC: the picker's largest option is `guestCount`, so the
 * question this panel can ask never reaches the seat the player is sitting in.
 * Leaving entirely is Cancel, on the claim bar, with its own confirmation —
 * two different acts, two different controls, which is the same reasoning that
 * keeps Remove photo and Remove banner apart.
 *
 * THE CUTOFF GATES THE REFUND, NOT THE CONTROL, and this mirrors
 * `CancelBookingForm` deliberately. `cancel_booking`'s own comment states the
 * rule: "Cancelling is still permitted right up to kickoff; only the refund is
 * gated. Freeing the spot late is worth more to everyone else than the player's
 * silence." A guest's seat freed two hours before kickoff is worth exactly as
 * much to the other eleven as the player's own would be — so the panel stays,
 * and the sentence under it changes from a promise to a warning.
 *
 * THE CONFIRM IS `window.confirm`, WHICH IS WHAT THE CANCEL FORM USES. This
 * spends nothing but it does destroy something with no undo past the cutoff,
 * and a bespoke dialog here would be a second modal to keep portalled —
 * CLAUDE.md's `z-50` law — for an act the platform already has a dialog for.
 *
 * THE FORM DOES NOT CLOSE ITSELF ON SUBMIT. Round 33 learned that the hard
 * way: a form that unmounts before its action answers hides its own error, so
 * the admin (here, the player) sees nothing at all. The server's next render is
 * what closes this — the redirect.
 */
export function CancelGuestsPanel({
  gameId,
  bookingId,
  guestCount,
  refundable,
  refundCutoffHours,
  creditPerGuest,
}: {
  gameId: string;
  bookingId: string;
  /** How many guests are on this booking. Always ≥ 1 here — the panel is not
   *  rendered otherwise, because an empty picker is a control with no question. */
  guestCount: number;
  /** Whether the game is still inside the refund window. The DB decides again. */
  refundable: boolean;
  /** The window, for the warning's `{hours}`. Only read when not refundable. */
  refundCutoffHours: number;
  /** What one removed guest comes back as, in CREDITS. */
  creditPerGuest: number;
}) {
  const t = useStrings();
  const locale = useLocale();
  const [state, formAction] = useActionState(cancelGuestsAction, CANCEL_GUESTS_INITIAL);
  const [picked, setPicked] = useState(1);

  const guestsLabel = (n: number) =>
    pluralise(
      {
        one: t.games.addGuests.guestOne,
        few: t.games.addGuests.guestMany,
        many: t.games.addGuests.guestMany,
      },
      n,
      locale,
    );

  const creditsLabel = (n: number) =>
    pluralise(
      {
        one: t.games.addGuests.creditOne,
        few: t.games.addGuests.creditFew,
        many: t.games.addGuests.creditMany,
      },
      n,
      locale,
    );

  return (
    <section data-testid="cancel-guests" className="mt-4 rounded-card bg-surface p-5">
      <h2 className="m-0 text-[17px] font-bold uppercase tracking-wide text-white">
        {t.games.cancelGuests.title}
      </h2>
      <p className="mt-2 mb-0 text-body leading-relaxed text-muted">
        {t.games.cancelGuests.body}
      </p>

      <GuestCountPicker
        max={guestCount}
        value={picked}
        onChange={setPicked}
        label={(n: number) => `−${n}`}
        ariaLabel={t.games.cancelGuests.title}
        testId="cancel-guests"
      />

      {/*
        WHAT COMES BACK, OR WHAT DOES NOT — said before the button, never after.
        Inside the window this is a figure in CREDITS, which is the unit the
        player holds; outside it the sentence names the window rather than a
        number, because "0 credits" reads like a bug and "past the cutoff" reads
        like a rule.
      */}
      {refundable ? (
        <p data-testid="cancel-guests-refund" className="mt-3 mb-0 text-small text-muted">
          {t.games.cancelGuests.refund.replace(
            "{credits}",
            creditsLabel(creditPerGuest * picked),
          )}
        </p>
      ) : (
        <p data-testid="cancel-guests-forfeit" className="mt-3 mb-0 text-small text-warn">
          {t.games.cancelGuests.forfeit.replace("{hours}", String(refundCutoffHours))}
        </p>
      )}

      <form
        action={formAction}
        className="mt-4"
        onSubmit={(event) => {
          const question = refundable
            ? t.games.cancelGuests.confirm
            : t.games.cancelGuests.confirmLate;
          if (!window.confirm(question.replace("{n}", guestsLabel(picked)))) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="gameId" value={gameId} />
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="guests" value={picked} />
        <Submit label={t.games.cancelGuests.submit.replace("{n}", guestsLabel(picked))} />
      </form>

      {state.status === "error" && (
        <p role="alert" data-testid="cancel-guests-error" className="mt-3 mb-0 text-small text-danger">
          {state.code === "CANCEL_WINDOW_CLOSED"
            ? t.games.cancelGuests.windowClosed
            : state.code === "INVALID_GUEST_COUNT"
              ? t.games.cancelGuests.countInvalid
              : t.games.addGuests.failed}
        </p>
      )}
    </section>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid="cancel-guests-submit"
      className="w-full rounded-control border-[1.5px] border-hairline-strong bg-transparent px-4 py-3 text-body font-bold text-bone disabled:opacity-40"
    >
      {pending ? label : label}
    </button>
  );
}
