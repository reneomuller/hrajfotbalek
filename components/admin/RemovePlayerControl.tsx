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
 * ~~THE MONEY IS THE `cancel_game` RULE. Credit in full whatever the lead
 * time.~~ THE ADMIN CHOOSES (round 42, the owner): a switch, OFF by default —
 * no Credit, for the player who pulled out late by message — and on to return
 * it in full, by round 40's rules. Reset to off every time the dialog opens, so
 * a refund is always a decision made for THIS player. Rendered only once
 * `admin_remove_booking` takes the choice; before that the old body stands.
 */
export function RemovePlayerControl({
  booking,
  gameId,
  canChooseCredit = false,
}: {
  booking: AdminBookingRow;
  gameId: string;
  /** Round 42 — whether `admin_remove_booking` takes `p_return_credit` yet. */
  canChooseCredit?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [returnCredit, setReturnCredit] = useState(false);
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
        onClick={() => {
          setReturnCredit(false);
          setOpen(true);
        }}
        data-testid="roster-remove"
        className="inline-flex min-h-10 items-center rounded-control border border-hairline px-3 text-[10px] uppercase tracking-eyebrow text-muted transition-colors hover:border-danger/50 hover:text-danger"
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
                {booking.nickname} —{" "}
                {canChooseCredit
                  ? strings.admin.rosterRemoveSeatReleased
                  : strings.admin.rosterRemoveConfirmBody}
              </p>

              <form action={action} className="mt-5 flex flex-wrap gap-3">
                <input type="hidden" name="bookingId" value={booking.id} />
                <input type="hidden" name="gameId" value={gameId} />
                {canChooseCredit && (
                  <CreditSwitch checked={returnCredit} onChange={setReturnCredit} />
                )}
                <ConfirmButton />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="min-h-11 rounded-control border border-hairline-strong px-4 text-[13px] text-bone"
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
      className="min-h-11 rounded-control bg-volt px-4 text-[13px] font-bold text-ink disabled:opacity-60"
    >
      {pending ? strings.common.loading : strings.admin.rosterRemoveConfirm}
    </button>
  );
}

/**
 * The pill: volt when the Credit goes back, the empty-segment grey when it
 * does not. A real checkbox underneath (`role="switch"`), so the form posts
 * `returnCredit=on` only when it is on, and keyboard and screen reader get a
 * switch for free; the line beneath says what will happen in words, because
 * a colour alone is not a sentence.
 */
function CreditSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="w-full">
      <label data-testid="roster-remove-credit-toggle" className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          name="returnCredit"
          role="switch"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          data-testid="roster-remove-credit"
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={`relative h-6 w-11 shrink-0 rounded-pill transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-volt ${
            checked ? "bg-volt" : "bg-surface-seg"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-pill bg-white transition-transform ${
              checked ? "translate-x-[22px]" : "translate-x-0.5"
            }`}
          />
        </span>
        <span className="text-[13px] font-bold text-bone">{strings.admin.rosterRemoveReturnCredit}</span>
      </label>
      <p data-testid="roster-remove-credit-note" className="m-0 mt-2 text-[12px] leading-relaxed text-muted">
        {checked ? strings.admin.rosterRemoveCreditOn : strings.admin.rosterRemoveCreditOff}
      </p>
    </div>
  );
}
