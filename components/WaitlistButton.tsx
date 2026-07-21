"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { joinWaitlistAction, type WaitlistActionState } from "@/app/game/[id]/waitlist/actions";
import { describeWaitlistError } from "@/lib/booking/errors";
import { strings } from "@/lib/strings";

const INITIAL: WaitlistActionState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid="join-waitlist"
      className="w-full rounded-cta bg-volt px-6 py-4 font-condensed text-cta font-extrabold uppercase tracking-wide text-surface disabled:opacity-60"
    >
      {pending ? strings.common.loading : strings.games.joinWaitlist}
    </button>
  );
}

/**
 * Join-waitlist button, shown only on a full game in place of the Book button.
 *
 * The already-joined case is a friendly state, not an error: the RPC dedupes
 * on the unique constraint and reports it, so a double tap says "you are
 * already on the list" rather than surfacing a constraint violation.
 */
export function WaitlistButton({
  gameId,
  alreadyOnList,
}: {
  gameId: string;
  alreadyOnList: boolean;
}) {
  const [state, formAction] = useActionState(joinWaitlistAction, INITIAL);

  const joined = state.status === "joined" || state.status === "already" || alreadyOnList;

  if (joined) {
    return (
      <div
        data-testid="waitlist-joined"
        className="mt-6 rounded-card border border-hairline-volt bg-surface-card p-5"
      >
        <p className="m-0 font-condensed text-[17px] font-bold uppercase tracking-wide text-volt">
          {state.status === "already" || alreadyOnList
            ? strings.games.waitlistAlready
            : strings.games.waitlistJoined}
        </p>
        <p className="mt-2 text-[13px] leading-snug text-muted">
          {strings.games.waitlistHint}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6">
      <input type="hidden" name="gameId" value={gameId} />
      <SubmitButton />
      <p className="mt-3 text-center text-[12px] leading-snug text-muted">
        {strings.games.waitlistHint}
      </p>
      {state.status === "error" && state.code && (
        <p role="alert" className="mt-3 text-center text-[13px] text-muted">
          {describeWaitlistError(state.code).message}
        </p>
      )}
    </form>
  );
}
