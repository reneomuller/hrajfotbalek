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
      className="w-full rounded-cta border border-hairline-link bg-transparent px-6 py-4 font-condensed text-cta font-extrabold uppercase tracking-wide text-bone disabled:opacity-60"
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
 */
export function CancelGameButton({ gameId, venue }: { gameId: string; venue: string }) {
  const [armed, setArmed] = useState(false);
  const [state, formAction] = useActionState(cancelGameAction, INITIAL);

  if (state.status === "cancelled") {
    return (
      <div
        data-testid="cancel-game-result"
        className="rounded-card border border-hairline-volt bg-surface-card p-5"
      >
        <div className="font-condensed text-[17px] font-bold uppercase tracking-wide text-volt">
          {strings.admin.cancelGameDone}
        </div>
        <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[13px]">
          <dt className="text-muted">{strings.admin.cancelledBookings}</dt>
          <dd className="m-0 text-right font-mono text-bone">{state.bookingsCancelled}</dd>
          <dt className="text-muted">{strings.admin.creditsIssued}</dt>
          <dd className="m-0 text-right font-mono text-bone">{state.creditsIssued}</dd>
          <dt className="text-muted">{strings.admin.waitlistCleared}</dt>
          <dd className="m-0 text-right font-mono text-bone">{state.waitlistCleared}</dd>
          <dt className="text-muted">{strings.admin.noticesSent}</dt>
          <dd className="m-0 text-right font-mono text-bone">{state.noticesSent}</dd>
          <dt className="text-muted">{strings.admin.receiptsSent}</dt>
          <dd className="m-0 text-right font-mono text-bone">{state.receiptsSent}</dd>
        </dl>
      </div>
    );
  }

  if (!armed) {
    return (
      <button
        type="button"
        data-testid="cancel-game"
        onClick={() => setArmed(true)}
        className="w-full rounded-cta border border-hairline-strong px-6 py-4 font-condensed text-cta font-extrabold uppercase tracking-wide text-muted"
      >
        {strings.admin.cancelGame}
      </button>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="gameId" value={gameId} />
      <p className="mb-4 text-[14px] leading-relaxed text-bone">
        {strings.admin.cancelGameWarning} <strong>{venue}</strong>
      </p>
      <ConfirmButton />
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="mt-3 w-full bg-transparent font-mono text-[11px] uppercase tracking-eyebrow text-muted"
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
