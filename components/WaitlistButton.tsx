"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { joinWaitlistAction, type WaitlistActionState } from "@/app/game/[id]/waitlist/actions";
import { describeWaitlistError } from "@/lib/booking/errors";
import { waitlistPositionLabel } from "@/lib/booking/waitlistLabel";
import { useStrings } from "@/components/LocaleProvider";
import { WaitlistStatus } from "@/components/game/WaitlistStatus";

const INITIAL: WaitlistActionState = { status: "idle" };

/**
 * §2.5's SECONDARY variant in the bar, primary in the panel.
 *
 * Secondary in the bar because joining a queue is not the commitment taking a
 * spot is, and one primary per screen region — the bar is the region, and on a
 * full game the queue is the only thing in it.
 *
 * Sentence case in both (ruling B). It was `uppercase tracking-wide`, which is
 * the eyebrow style applied to a button.
 */
function SubmitButton({ variant }: { variant: "panel" | "bar" }) {
  const t = useStrings();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      data-testid="join-waitlist"
      className={
        variant === "bar"
          ? "flex min-h-[52px] shrink-0 items-center justify-center rounded-control border border-hairline-strong px-5 text-body-lg font-semibold text-bone transition-colors hover:border-hairline-volt disabled:opacity-60"
          : "w-full rounded-control bg-volt px-6 py-4 text-body-lg font-bold text-ink disabled:opacity-60"
      }
    >
      {pending ? t.common.loading : t.games.joinWaitlist}
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
  position,
  variant = "panel",
}: {
  gameId: string;
  alreadyOnList: boolean;
  /**
   * The player's place in the queue, computed on the server. Null right after
   * an interactive join: the row exists but this render predates it. The
   * action revalidates the page, so the line appears on the next paint rather
   * than being guessed at here.
   */
  position: number | null;
  /** `bar` is the §2.4 claim bar's full state — the control alone. */
  variant?: "panel" | "bar";
}) {
  const t = useStrings();
  const [state, formAction] = useActionState(joinWaitlistAction, INITIAL);

  const joined = state.status === "joined" || state.status === "already" || alreadyOnList;
  const positionLabel = waitlistPositionLabel(position, t);

  /*
   * IN THE BAR, THE JOINED STATE IS THE SERVER'S TO RENDER.
   *
   * `joinWaitlistAction` revalidates, and the next server render resolves the
   * bar to its `waitlisted` state with a position read under RLS. So this only
   * has to cover the gap between the submit landing and that render arriving —
   * a quiet line, not a panel. Anything more would be a client-state success
   * marker on a surface `revalidatePath` is about to unmount (CLAUDE.md), and
   * the panel below is where the full treatment belongs.
   */
  if (variant === "bar") {
    if (joined) {
      return (
        <span data-testid="claim-bar-waitlisted" className="text-small text-muted">
          {positionLabel ?? t.booking.barOnWaitlistNoPosition}
        </span>
      );
    }
    return (
      <form action={formAction}>
        <input type="hidden" name="gameId" value={gameId} />
        <SubmitButton variant="bar" />
      </form>
    );
  }

  if (joined) {
    /*
      THE JOINED STATE (§3 screen 8), drawn rather than described. It was a
      panel of three stacked paragraphs — a heading, a position at 22px, and
      the hint — which is the same three facts this says in the shape the
      other two waitlist states use.

      The position is passed through `waitlistPositionLabel`, which returns
      null when the RPC could not answer; the block then shows the title and
      the hint alone rather than an empty line where a number should be.
    */
    return (
      <div data-testid="waitlist-joined" className="mt-6">
        <WaitlistStatus
          tone="waiting"
          title={
            state.status === "already" || alreadyOnList
              ? t.games.waitlistAlready
              : t.games.waitlistJoinedTitle
          }
          position={positionLabel}
          hint={t.games.waitlistHint}
        />
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6">
      <input type="hidden" name="gameId" value={gameId} />
      <SubmitButton variant="panel" />
      <p className="mt-3 text-center text-[12px] leading-snug text-muted">
        {t.games.waitlistHint}
      </p>
      {state.status === "error" && state.code && (
        <p role="alert" className="mt-3 text-center text-[13px] text-muted">
          {describeWaitlistError(state.code, t).message}
        </p>
      )}
    </form>
  );
}
