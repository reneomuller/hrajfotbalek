"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { setGuestsAction, type GuestsState } from "@/app/admin/games/[id]/guests/actions";
import { strings } from "@/lib/strings";

const INITIAL: GuestsState = { status: "idle" };

/**
 * Add and remove house guests on a game.
 *
 * TWO BUTTONS, ONE ACTION, AND NO NUMBER FIELD. The admin's question is "one
 * more" or "one fewer" — they are looking at a roster and counting people, not
 * entering a quantity. A number input would also let a typo set forty guests
 * on a twelve-a-side pitch.
 *
 * SUBMITS THE TARGET, NOT THE DELTA. Each button posts the count it wants the
 * game to end up at, so two admins pressing "add" at the same moment produce
 * `n+1` twice rather than `n+2`.
 *
 * ROUND 42: a stepper — remove, the count, add — so the number sits between
 * the two things that change it.
 */
export function GuestControl({
  gameId,
  count,
  seatsLeft,
}: {
  gameId: string;
  /** House guests the game currently holds. */
  count: number;
  /** Seats still free, so "add" can be disabled rather than refused. */
  seatsLeft: number;
}) {
  const [state, formAction] = useActionState(setGuestsAction, INITIAL);

  // The action's answer wins over the prop: after a save the page revalidates,
  // but the returned count is authoritative for the render that happens first.
  const shown = state.status === "saved" && typeof state.count === "number" ? state.count : count;

  return (
    <div data-testid="guest-control" className="mt-3">
      <div className="flex items-center gap-3">
        <form action={formAction}>
          <input type="hidden" name="gameId" value={gameId} />
          <input type="hidden" name="count" value={Math.max(0, shown - 1)} />
          <StepButton label={strings.admin.guestsRemove} testId="guest-remove" disabled={shown <= 0} sign="minus" />
        </form>

        <p className="m-0 flex min-w-0 items-baseline gap-2">
          <span data-testid="guest-count" className="font-display text-[28px] leading-none tabular-nums text-volt">
            {shown}
          </span>
          <span className="text-[12px] text-muted">{strings.admin.guestsCount}</span>
        </p>

        <form action={formAction}>
          <input type="hidden" name="gameId" value={gameId} />
          <input type="hidden" name="count" value={shown + 1} />
          <StepButton label={strings.admin.guestsAdd} testId="guest-add" disabled={seatsLeft <= 0} sign="plus" />
        </form>
      </div>

      {seatsLeft <= 0 && <p className="mt-2 text-[12px] text-muted">{strings.admin.guestsNoRoom}</p>}
      {state.status === "saved" && (
        <p data-testid="guests-saved" className="mt-2 text-[13px] text-volt">
          {strings.admin.guestsSaved}
        </p>
      )}
      {state.status === "error" && state.message && (
        <p role="alert" data-testid="guests-error" className="mt-2 text-[13px] text-bone">
          {state.message}
        </p>
      )}
    </div>
  );
}

/**
 * A − or + that is DRAWN, not typed: a glyph whose shape is the message is not
 * left to font fallback (CLAUDE.md). The words are the button's accessible
 * name and its tooltip.
 */
function StepButton({
  label,
  testId,
  disabled,
  sign,
}: {
  label: string;
  testId: string;
  disabled: boolean;
  sign: "minus" | "plus";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      aria-label={label}
      title={label}
      data-testid={testId}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-pill border border-hairline-strong text-bone transition-colors hover:border-volt hover:text-volt disabled:cursor-not-allowed disabled:opacity-40"
    >
      <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M3 8h10" />
        {sign === "plus" && <path d="M8 3v10" />}
      </svg>
    </button>
  );
}
