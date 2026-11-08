"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { setPitchCostAction, type PitchCostState } from "@/app/admin/games/[id]/actions";
import { strings } from "@/lib/strings";

const hub = strings.admin.gamesHub;
const INITIAL: PitchCostState = { status: "idle" };

/**
 * Correct this game's pitch cost (round 42, the admin rebuild).
 *
 * THE BOX HOLDS ONLY A HAND-SET COST. A cost that came from the venue shows as
 * the placeholder, so saving an untouched box keeps the game on the venue's
 * price rather than freezing today's number as "set by hand"; clearing a
 * hand-set cost and saving puts it back on the venue's.
 *
 * CONTROLLED, and always open: React resets an uncontrolled form once its
 * action returns, which would put the old number back over a refused one, and
 * a form that closes itself on submit hides its own error (CLAUDE.md).
 */
export function PitchCostForm({
  gameId,
  costCzk,
  setByHand,
}: {
  gameId: string;
  /** The cost now, or null for a game with none. */
  costCzk: number | null;
  setByHand: boolean;
}) {
  const [state, formAction] = useActionState(setPitchCostAction, INITIAL);
  const [value, setValue] = useState(setByHand && costCzk !== null ? String(costCzk) : "");

  return (
    <form action={formAction} data-testid="pitch-cost-form" className="mt-4">
      <input type="hidden" name="gameId" value={gameId} />
      <label htmlFor="pitch-cost-input" className="block text-[10px] uppercase tracking-eyebrow text-muted">
        {hub.pitchCostLabel}
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id="pitch-cost-input"
          name="costCzk"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={value}
          placeholder={costCzk === null ? undefined : String(costCzk)}
          onChange={(event) => setValue(event.target.value)}
          data-testid="pitch-cost-input"
          className="min-h-11 w-full min-w-0 flex-1 rounded-control border border-hairline-strong bg-surface px-3 py-2 text-[13px] tabular-nums text-bone outline-none transition-colors placeholder:text-faint focus:border-volt"
        />
        <SaveButton />
      </div>
      <p className="mt-1 text-[12px] leading-snug text-muted">{hub.pitchCostHint}</p>

      {state.status === "saved" && (
        <p data-testid="pitch-cost-saved" className="mt-2 text-[12px] text-volt">
          {hub.pitchCostSaved}
        </p>
      )}
      {state.status === "error" && state.message && (
        <p role="alert" data-testid="pitch-cost-error" className="mt-2 text-[12px] text-bone">
          {state.message}
        </p>
      )}
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid="pitch-cost-save"
      className="inline-flex min-h-11 shrink-0 items-center rounded-control border border-hairline-volt px-4 text-[13px] font-bold text-volt transition-colors hover:border-volt disabled:opacity-60"
    >
      {pending ? strings.common.loading : hub.pitchCostSave}
    </button>
  );
}
