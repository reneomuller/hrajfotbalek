"use client";

import { useActionState } from "react";
import { setGuestsAction, type GuestsState } from "@/app/admin/games/[id]/guests/actions";
import { PendingButton } from "@/components/form/PendingButton";
import { strings } from "@/lib/strings";

const INITIAL: GuestsState = { status: "idle" };

/**
 * Add and remove house guests on a game.
 *
 * TWO BUTTONS, ONE ACTION, AND NO NUMBER FIELD. The admin's question is "one
 * more" or "one fewer" — they are looking at a roster and counting people, not
 * entering a quantity. A number input would also let a typo set forty guests
 * on a twelve-a-side pitch, which the RPC would refuse with an error where a
 * disabled button says the same thing before the press.
 *
 * SUBMITS THE TARGET, NOT THE DELTA. Each button posts the count it wants the
 * game to end up at, so two admins pressing "add" at the same moment produce
 * `n+1` twice rather than `n+2`: the second write is idempotent instead of
 * compounding a stale read. It is the same reason `set_game_capacity` takes a
 * capacity rather than an increment.
 *
 * ENGLISH, like the rest of the panel — ruling R22.
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
    <div data-testid="guest-control" className="mt-4">
      <p className="m-0 text-[13px] text-muted">
        {strings.admin.guestsCount}:{" "}
        <span data-testid="guest-count" className="font-bold text-bone">
          {shown}
        </span>
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <form action={formAction}>
          <input type="hidden" name="gameId" value={gameId} />
          <input type="hidden" name="count" value={shown + 1} />
          <PendingButton
            label={strings.admin.guestsAdd}
            testId="guest-add"
            disabled={seatsLeft <= 0}
          />
        </form>

        <form action={formAction}>
          <input type="hidden" name="gameId" value={gameId} />
          <input type="hidden" name="count" value={Math.max(0, shown - 1)} />
          <PendingButton
            label={strings.admin.guestsRemove}
            testId="guest-remove"
            disabled={shown <= 0}
          />
        </form>
      </div>

      {state.status === "saved" && (
        <p data-testid="guests-saved" className="mt-3 text-[13px] text-volt">
          {strings.admin.guestsSaved}
        </p>
      )}
      {state.status === "error" && state.message && (
        <p role="alert" data-testid="guests-error" className="mt-3 text-[13px] text-bone">
          {state.message}
        </p>
      )}
    </div>
  );
}
