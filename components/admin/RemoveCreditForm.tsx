"use client";

import { useActionState, useState } from "react";
import { removeCreditAction, type GrantCreditState } from "@/app/admin/players/actions";
import { formatCzk } from "@/lib/format";
import { strings } from "@/lib/strings";

const INITIAL: GrantCreditState = { status: "idle" };

/**
 * Take credit back out of a wallet (round 28, item 5b).
 *
 * COLLAPSED, LIKE ITS SIBLING, AND FOR A STRONGER REASON. `GrantCreditForm`
 * hides behind a button so the page is readable; this one hides behind a
 * button so the most consequential control in the panel is never one stray tap
 * from a balance. The two sit side by side and look alike deliberately — they
 * are the same act in two directions — but this one asks for confirmation and
 * that one does not.
 *
 * THE AMOUNT IS TYPED POSITIVE AND NEGATED BY THE ACTION. A form that asks for
 * "-50" invites "-‑50" and invites somebody to type "50" and add money while
 * reading a heading that says remove. The label says how much to take; the
 * server decides the sign.
 *
 * THE NOTE IS REQUIRED, in the form and again in the action. This is the one
 * movement in the ledger nobody can reconstruct later from a booking or a
 * top-up, so "why" has to be written down while the person who knows is still
 * looking at the screen.
 *
 * NO FLOOR IS COMPUTED HERE. The balance is shown for context, not consulted
 * for permission — `grant_credit` refuses under the player's advisory lock,
 * which is the only place two concurrent removals can be made to agree.
 */
export function RemoveCreditForm({
  playerId,
  balanceCzk,
}: {
  playerId: string;
  /** Shown so the admin can see what they are taking from. Not a gate. */
  balanceCzk: number;
}) {
  const [state, formAction] = useActionState(removeCreditAction, INITIAL);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="remove-credit-open"
        className="inline-flex min-h-11 items-center rounded-pill border border-hairline-strong px-3 text-small font-semibold text-danger transition-colors hover:border-danger"
      >
        {strings.admin.removeCredit}
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-2 w-full space-y-3">
      <input type="hidden" name="playerId" value={playerId} />

      <p className="m-0 text-[10px] uppercase tracking-eyebrow text-muted">
        {strings.admin.removeCreditBalance.replace("{balance}", formatCzk(balanceCzk))}
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-eyebrow text-muted">
            {strings.admin.removeCreditAmount}
          </span>
          <input
            type="number"
            name="amount"
            min={1}
            step={1}
            required
            data-testid="remove-amount"
            className="h-11 w-32 rounded-control border border-hairline bg-transparent px-3 text-body text-white"
          />
        </label>

        <label className="flex min-w-[180px] flex-1 flex-col gap-1">
          <span className="text-[10px] uppercase tracking-eyebrow text-muted">
            {strings.admin.removeCreditNote}
          </span>
          <input
            type="text"
            name="note"
            required
            minLength={3}
            data-testid="remove-note"
            className="h-11 w-full rounded-control border border-hairline bg-transparent px-3 text-body text-white"
          />
        </label>
      </div>

      {state.status === "error" && (
        <p data-testid="remove-credit-error" className="m-0 text-[12px] text-danger">
          {state.message}
        </p>
      )}
      {state.status === "granted" && (
        <p data-testid="remove-credit-done" className="m-0 text-[12px] text-volt">
          {typeof state.balanceCzk === "number"
            ? strings.admin.removeCreditDone.replace(
                "{balance}",
                formatCzk(state.balanceCzk),
              )
            : strings.admin.removeCreditDoneBare}
        </p>
      )}

      {/*
        CONFIRM, BECAUSE THIS ONE IS DESTRUCTIVE. Not a portalled dialog — the
        form is already open and inline, and a modal over an inline form is two
        layers of "are you sure" for one act. The submit button simply refuses
        to be a submit button until it has been armed, which is the same
        property with one fewer stacking context to get wrong.
      */}
      <div className="flex flex-wrap gap-2">
        {confirming ? (
          <button
            type="submit"
            data-testid="remove-credit-submit"
            className="inline-flex min-h-11 items-center rounded-pill bg-danger px-4 text-small font-bold text-white"
          >
            {strings.admin.removeCreditConfirm}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            data-testid="remove-credit-arm"
            className="inline-flex min-h-11 items-center rounded-pill border border-danger px-4 text-small font-bold text-danger"
          >
            {strings.admin.removeCredit}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setOpen(false);
          }}
          data-testid="remove-credit-cancel"
          className="inline-flex min-h-11 items-center rounded-pill border border-hairline-strong px-4 text-small font-semibold text-muted"
        >
          {strings.admin.removeCreditCancel}
        </button>
      </div>
    </form>
  );
}
