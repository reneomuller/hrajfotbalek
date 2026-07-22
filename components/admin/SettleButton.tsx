"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  settleGameAction,
  type AttendanceState,
} from "@/app/admin/games/[id]/attendance/actions";
import { strings } from "@/lib/strings";

const INITIAL: AttendanceState = { status: "idle" };

/**
 * Settle, and the block that stops it.
 *
 * The refusal comes from `settle_game` itself; this renders the names it could
 * not close over. Naming them matters: "settle is blocked" without a list
 * leaves the organizer scanning a roster for what a database already knew.
 */
export function SettleButton({ gameId }: { gameId: string }) {
  const [state, formAction] = useActionState(settleGameAction, INITIAL);

  if (state.status === "saved") {
    return (
      <p data-testid="settle-done" className="font-condensed text-[17px] font-bold uppercase tracking-wide text-volt">
        {strings.admin.settled}
      </p>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="gameId" value={gameId} />
      <Submit />

      {state.status === "blocked" && (
        <div role="alert" data-testid="settle-blocked" className="mt-3 text-[13px] text-bone">
          <p className="m-0">{strings.admin.settleBlocked}</p>
          <ul className="mt-2 list-none p-0 font-mono text-[12px] text-volt">
            {(state.outstanding ?? []).map((nickname) => (
              <li key={nickname}>{nickname}</li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-muted">{strings.admin.settleBlockedHint}</p>
        </div>
      )}

      {state.status === "error" && state.message && (
        <p role="alert" className="mt-3 text-[13px] text-muted">
          {state.message}
        </p>
      )}
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid="settle-game"
      className="rounded-cta bg-volt px-6 py-4 font-condensed text-cta font-extrabold uppercase tracking-wide text-surface disabled:opacity-60"
    >
      {pending ? strings.common.loading : strings.admin.settleGame}
    </button>
  );
}
