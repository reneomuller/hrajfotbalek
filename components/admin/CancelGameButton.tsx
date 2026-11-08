"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { cancelGameAction, type CancelGameState } from "@/app/admin/games/[id]/cancel/actions";
import { describeBookingError } from "@/lib/booking/errors";
import { strings } from "@/lib/strings";

const INITIAL: CancelGameState = { status: "idle" };

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid="cancel-game-confirm"
      className="min-h-[52px] w-full rounded-control border border-danger bg-danger/[.12] px-6 text-cta font-extrabold uppercase tracking-wide text-danger disabled:opacity-60"
    >
      {pending ? strings.common.loading : strings.admin.cancelGameConfirm}
    </button>
  );
}

/**
 * Cancel-game trigger with a two-step confirmation.
 *
 * The confirmation is not ceremony: this cancels every booking on the game,
 * moves every affected player's money into their wallet, clears the waitlist
 * and mails everyone. There is no undo — `cancel_game` refuses to run twice,
 * and nothing restores a cancelled game.
 *
 * THE TWO HALVES ARE KEYED APART (CLAUDE.md): an unkeyed swap from a
 * `type="button"` to a submit can let React reuse one element and flip its type
 * inside the very click that armed it, which then submits.
 */
export function CancelGameButton({
  gameId,
  venue,
  needsReason = false,
}: {
  gameId: string;
  venue: string;
  /**
   * Whether this database can RECORD a reason (round 16, item 19). The field
   * is not shown when it cannot be stored: asking somebody to explain
   * themselves and then discarding what they wrote is worse than not asking.
   */
  needsReason?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const [state, formAction] = useActionState(cancelGameAction, INITIAL);

  if (state.status === "cancelled") {
    return (
      <div key="done" data-testid="cancel-game-result" className="rounded-card bg-surface p-5">
        <div className="text-[17px] font-bold uppercase tracking-wide text-volt">{strings.admin.cancelGameDone}</div>
        <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[13px]">
          <dt className="text-muted">{strings.admin.cancelledBookings}</dt>
          <dd className="m-0 text-right tabular-nums text-bone">{state.bookingsCancelled}</dd>
          <dt className="text-muted">{strings.admin.creditsIssued}</dt>
          <dd className="m-0 text-right tabular-nums text-bone">{state.creditsIssued}</dd>
          <dt className="text-muted">{strings.admin.waitlistCleared}</dt>
          <dd className="m-0 text-right tabular-nums text-bone">{state.waitlistCleared}</dd>
          <dt className="text-muted">{strings.admin.noticesSent}</dt>
          <dd className="m-0 text-right tabular-nums text-bone">{state.noticesSent}</dd>
          <dt className="text-muted">{strings.admin.receiptsSent}</dt>
          <dd className="m-0 text-right tabular-nums text-bone">{state.receiptsSent}</dd>
        </dl>
      </div>
    );
  }

  if (!armed) {
    return (
      <button
        key="arm"
        type="button"
        data-testid="cancel-game"
        onClick={() => setArmed(true)}
        className="min-h-[52px] w-full rounded-control border border-hairline-strong px-6 text-cta font-extrabold uppercase tracking-wide text-muted transition-colors hover:border-danger/60 hover:text-danger"
      >
        {strings.admin.cancelGame}
      </button>
    );
  }

  return (
    <form key="confirm" action={formAction} className="rounded-card border border-danger/40 p-4">
      <input type="hidden" name="gameId" value={gameId} />
      <p className="m-0 mb-4 text-[14px] leading-relaxed text-bone">
        {strings.admin.cancelGameWarning} <strong>{venue}</strong>
      </p>

      {/*
        THE REASON, REQUIRED (round 16, item 19) — `required` here, checked in
        the action, validated in SQL. THE LABEL SAYS WHO READS IT: every booked
        player receives it verbatim.
      */}
      {needsReason && (
        <label className="mb-4 block">
          <span className="field-label block">{strings.admin.cancelReasonLabel}</span>
          <textarea
            name="reason"
            required
            rows={3}
            maxLength={500}
            data-testid="cancel-reason"
            className="field mt-1 w-full"
            placeholder={strings.admin.cancelReasonPlaceholder}
          />
          <span className="mt-1 block text-[12px] text-muted">{strings.admin.cancelReasonHint}</span>
        </label>
      )}

      <ConfirmButton />
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="mt-3 min-h-11 w-full bg-transparent text-[11px] uppercase tracking-eyebrow text-muted"
      >
        {strings.common.close}
      </button>
      {state.status === "error" && state.code && (
        <p role="alert" className="mt-3 text-[13px] text-muted">
          {describeBookingError(state.code).message}
        </p>
      )}
    </form>
  );
}
