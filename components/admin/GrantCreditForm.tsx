"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { grantCreditAction, type GrantCreditState } from "@/app/admin/players/actions";
import { formatCzk } from "@/lib/format";
import { strings } from "@/lib/strings";

const INITIAL: GrantCreditState = { status: "idle" };

/**
 * Per-player credit grant, collapsed until asked for.
 *
 * The unmatched-payment checkbox is the whole reason this surface exists: it
 * is what turns "money arrived and I do not know whose it is" into a ledger
 * row with a `payment_unmatched` event beside it, written in the same
 * transaction by the RPC.
 */
export function GrantCreditForm({ playerId }: { playerId: string }) {
  const [state, formAction] = useActionState(grantCreditAction, INITIAL);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="grant-credit-open"
        className="inline-flex min-h-11 items-center rounded-pill border border-hairline-strong px-3 text-small font-semibold transition-colors hover:border-volt text-volt"
      >
        {strings.admin.grantCredit}
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-2 w-full space-y-3">
      <input type="hidden" name="playerId" value={playerId} />

      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-eyebrow text-muted">
            {strings.admin.grantAmountLabel}
          </span>
          <input
            name="amount"
            type="number"
            step={1}
            required
            data-testid="grant-amount"
            className="mt-1 w-[130px] rounded-control border border-hairline-strong bg-surface px-3 py-2 text-[13px] text-bone"
          />
        </label>

        <label className="block flex-1">
          <span className="block text-[10px] uppercase tracking-eyebrow text-muted">
            {strings.admin.grantNoteLabel}
          </span>
          {/*
            REQUIRED SINCE ROUND 7, item 9. A credit grant is money appearing
            in someone's wallet with no booking behind it, and the ledger row
            it writes is the only record of WHY. An unexplained grant is
            indistinguishable from a mistake six weeks later — including to
            the person who made it. The server enforces it too; this is the
            courtesy that saves a round trip.
          */}
          <input
            name="note"
            required
            minLength={3}
            maxLength={200}
            data-testid="grant-note"
            className="mt-1 w-full rounded-control border border-hairline-strong bg-surface px-3 py-2 text-[13px] text-bone"
          />
        </label>

        <SubmitButton />
      </div>

      <p className="text-[12px] text-muted">{strings.admin.grantAmountHint}</p>

      <label className="flex items-start gap-2 text-[12px] text-bone">
        <input type="checkbox" name="unmatched" data-testid="grant-unmatched" className="mt-1" />
        {strings.admin.grantUnmatchedLabel}
      </label>

      {state.status === "granted" && (
        <p data-testid="grant-done" className="text-[12px] text-volt">
          {strings.admin.grantDone}
          {state.balanceCzk !== undefined && <> — {formatCzk(state.balanceCzk)}</>}
        </p>
      )}
      {state.status === "error" && state.message && (
        <p role="alert" className="text-[12px] text-muted">
          {state.message}
        </p>
      )}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid="grant-submit"
      className="rounded-control bg-volt px-5 py-3 text-[14px] font-extrabold uppercase tracking-wide text-surface disabled:opacity-60"
    >
      {pending ? strings.common.loading : strings.admin.grantSubmit}
    </button>
  );
}
