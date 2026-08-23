"use client";

import { useActionState, useState } from "react";
import { createPortal } from "react-dom";
import { useFormStatus } from "react-dom";
import {
  removeBookingAction,
  type RemoveBookingState,
} from "@/app/admin/games/[id]/actions";
import type { AdminBookingRow } from "@/lib/admin/queries";
import { strings } from "@/lib/strings";

const INITIAL: RemoveBookingState = { status: "idle" };

/**
 * Releasing a player's seat (round 16, item 17).
 *
 * PORTALLED, AND NOT FOR TIDINESS. CLAUDE.md's modal law: `z-50` is a rank
 * WITHIN a stacking context, and the admin shell is `relative z-10` — so a
 * dialog rendered inside it is capped below the nav pill at `z-40` and becomes
 * visible, enabled and permanently unreachable. `createPortal` into
 * `document.body` is the only thing that lets its z-index compete on equal
 * terms. `CancelBookingForm` is the worked example.
 *
 * A DIALOG AT ALL, unlike present and no-show beside it, because the two
 * attendance marks are reversible by pressing the other one and this is not:
 * the seat goes back to the pool and credit moves. The body says so — an
 * "are you sure" that does not name the consequence is a speed bump rather
 * than a decision.
 *
 * THE MONEY IS THE `cancel_game` RULE. Credit in full whatever the lead time,
 * because the player did not choose this; the lateness forfeit exists to price
 * a late CHOICE. Decided in SQL, stated here.
 */
export function RemovePlayerControl({
  booking,
  gameId,
}: {
  booking: AdminBookingRow;
  gameId: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(removeBookingAction, INITIAL);

  if (state.status === "removed") {
    return (
      <span data-testid="roster-removed" className="text-[10px] uppercase tracking-eyebrow text-faint">
        {strings.admin.rosterRemoved}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="roster-remove"
        className="rounded-control border border-hairline px-3 py-2 text-[10px] uppercase tracking-eyebrow text-muted transition-colors hover:border-hairline-strong hover:text-bone"
      >
        {strings.admin.rosterRemove}
      </button>

      {state.status === "error" && state.message && (
        <span role="alert" className="text-[12px] text-muted">
          {state.message}
        </span>
      )}

      {open &&
        createPortal(
          <>
            <button
              type="button"
              aria-label={strings.common.close}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[60] cursor-default bg-ink/70"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={strings.admin.rosterRemoveConfirmTitle}
              data-testid="roster-remove-dialog"
              className="lifted fixed left-1/2 top-1/2 z-[61] w-[min(360px,calc(100vw-2*22px))] -translate-x-1/2 -translate-y-1/2 rounded-card p-5 shadow-lift"
            >
              <h2 className="m-0 text-[17px] font-bold uppercase tracking-wide text-white">
                {strings.admin.rosterRemoveConfirmTitle}
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-bone">
                {booking.nickname} — {strings.admin.rosterRemoveConfirmBody}
              </p>

              <form action={action} className="mt-5 flex flex-wrap gap-3">
                <input type="hidden" name="bookingId" value={booking.id} />
                <input type="hidden" name="gameId" value={gameId} />
                <ConfirmButton />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-control border border-hairline-strong px-4 py-2 text-[13px] text-bone"
                >
                  {strings.common.close}
                </button>
              </form>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid="roster-remove-confirm"
      className="rounded-control bg-volt px-4 py-2 text-[13px] font-bold text-ink disabled:opacity-60"
    >
      {pending ? strings.common.loading : strings.admin.rosterRemoveConfirm}
    </button>
  );
}
