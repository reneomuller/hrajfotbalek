"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { leaveWaitlistAction, type WaitlistActionState } from "@/app/game/[id]/waitlist/actions";
import { useStrings } from "@/components/LocaleProvider";

const INITIAL: WaitlistActionState = { status: "idle" };

/**
 * The way OFF a waitlist (round 16, item 11).
 *
 * JOINING WAS A DOOR THAT ONLY OPENED. A player on a queue had two exits:
 * convert a spot they no longer wanted, or ignore the email when it arrived.
 * The second is the one that actually happened — and under notify-all FCFS an
 * ignored notification is a spot sitting open while somebody further down the
 * list never hears about it. Leaving helps the queue as much as the player.
 *
 * IT LIVES IN THE CLAIM BAR, beside the position, because that is where a
 * waitlisted player's status is stated. `WaitlistButton`'s panel variant draws
 * a fuller joined state and would have been the obvious home — but nothing
 * renders that variant; the bar is the only surface a waitlisted player sees.
 *
 * A QUIET UNDERLINED LINK, NOT A BUTTON. It is the least important control on
 * the bar and must not compete with the claim CTA beside it, but the
 * surrounding text is not interactive, so it needs the underline to read as
 * something you can press.
 *
 * GATED, because `leave_waitlist` arrives with the round-16 migration and the
 * code ships first — see `lib/db/capabilities.ts`.
 */
export function LeaveWaitlistControl({ gameId }: { gameId: string }) {
  const t = useStrings();
  const [state, action] = useActionState(leaveWaitlistAction, INITIAL);

  /*
   * The action revalidates, so the server is about to re-render the bar
   * without the waitlisted state at all. This covers only the gap between the
   * submit landing and that arriving — a client-state marker any longer-lived
   * than that gets unmounted before it is read (CLAUDE.md).
   */
  if (state.status === "left") {
    return (
      <span data-testid="waitlist-left" className="text-small text-muted">
        {t.games.waitlistLeftDone}
      </span>
    );
  }

  return (
    <form action={action} className="shrink-0">
      <input type="hidden" name="gameId" value={gameId} />
      <LeaveButton />
      {state.status === "error" && (
        <span role="alert" className="ml-2 text-small text-muted">
          {t.errors.generic}
        </span>
      )}
    </form>
  );
}

/** Separated so `useFormStatus` reads this form rather than an ancestor's. */
function LeaveButton() {
  const t = useStrings();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      data-testid="leave-waitlist"
      className="text-small text-muted underline underline-offset-4 transition-colors hover:text-bone disabled:opacity-60"
    >
      {pending ? t.common.loading : t.games.waitlistLeave}
    </button>
  );
}
