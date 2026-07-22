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
        className="bg-transparent font-mono text-[10px] uppercase tracking-eyebrow text-volt"
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
          <span className="block font-mono text-[10px] uppercase tracking-eyebrow text-muted">
            {strings.admin.grantAmountLabel}
          </span>
          <input
            name="amount"
            type="number"
            step={1}
            required
            data-testid="grant-amount"
            className="mt-1 w-[130px] rounded-control border border-hairline-strong bg-surface px-3 py-2 font-mono text-[13px] text-bone"
          />
        </label>

        <label className="block flex-1">
          <span className="block font-mono text-[10px] uppercase tracking-eyebrow text-muted">
            {strings.admin.grantNoteLabel}
          </span>
          <input
            name="note"
            maxLength={200}
            className="mt-1 w-full rounded-control border border-hairline-strong bg-surface px-3 py-2 font-mono text-[13px] text-bone"
          />
        </label>

        <SubmitButton />
      </div>

      <p className="text-[12px] text-muted-dim">{strings.admin.grantAmountHint}</p>

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
      className="rounded-cta bg-volt px-5 py-3 font-condensed text-[14px] font-extrabold uppercase tracking-wide text-surface disabled:opacity-60"
    >
      {pending ? strings.common.loading : strings.admin.grantSubmit}
    </button>
  );
}
