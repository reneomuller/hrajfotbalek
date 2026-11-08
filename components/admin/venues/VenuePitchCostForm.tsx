"use client";

import { useActionState, useState } from "react";
import { saveVenuePitchCostsAction, type PitchCostState } from "@/app/admin/venues/actions";
import { PendingButton } from "@/components/form/PendingButton";
import {
  PITCH_SEASONS,
  pitchCostInForce,
  type PitchCostPair,
} from "@/lib/admin/venues/pitchCosts";
import { formatCzk } from "@/lib/format";
import type { PitchSeason } from "@/lib/types/database";
import { strings } from "@/lib/strings";

const INITIAL: PitchCostState = { status: "idle" };

/** The form field each season posts as — what the action reads. */
const FIELD_NAME: Record<PitchSeason, "summerCzk" | "winterCzk"> = {
  summer: "summerCzk",
  winter: "winterCzk",
};

/**
 * A venue's pitch cost, summer and winter (round 42, the admin rebuild) — the
 * owner's "area for 'pitch cost' ... two values, one for summer and another for
 * winter". Whole crowns, per game, flat.
 *
 * THE ONE NEW GAMES TAKE IS MARKED, from the page's read of the season switch,
 * with the same volt ring the switch uses for the season in force.
 *
 * CONTROLLED INPUTS, ON PURPOSE. React resets an uncontrolled form after its
 * action returns — even when the action returned a refusal — so a box named as
 * wrong would snap back to the old cost before anyone could fix it. These keep
 * what was typed until the admin changes it.
 *
 * THE CONFIRMATION STAYS until the next edit, and nothing closes: the venue's
 * row stays open around it.
 */
export function VenuePitchCostForm({
  venueId,
  costs,
  season,
}: {
  venueId: string;
  costs: PitchCostPair | null;
  season: PitchSeason;
}) {
  const [state, formAction] = useActionState(saveVenuePitchCostsAction, INITIAL);
  const [values, setValues] = useState<Record<PitchSeason, string>>({
    summer: costs ? String(costs.summerCzk) : "",
    winter: costs ? String(costs.winterCzk) : "",
  });
  const [editedSinceSave, setEditedSinceSave] = useState(false);
  const copy = strings.admin.pitch;

  const saved =
    state.status === "saved" &&
    !editedSinceSave &&
    state.summerCzk !== undefined &&
    state.winterCzk !== undefined
      ? { summerCzk: state.summerCzk, winterCzk: state.winterCzk }
      : null;
  const invalid = state.status === "error" && !editedSinceSave ? (state.invalid ?? []) : [];

  return (
    <form
      action={formAction}
      onSubmit={() => setEditedSinceSave(false)}
      data-testid="venue-pitch-cost-form"
    >
      <input type="hidden" name="venueId" value={venueId} />
      <p className="m-0 text-[12px] leading-relaxed text-muted">{copy.costLede}</p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {PITCH_SEASONS.map((each) => {
          const id = `pitch-cost-${each}-${venueId}`;
          const inForce = each === season;
          const isInvalid = invalid.includes(each);
          return (
            <div
              key={each}
              data-testid={`venue-pitch-cost-${each}`}
              data-in-force={inForce ? "true" : "false"}
              className={`min-w-0 rounded-control border bg-surface p-3 ${
                inForce ? "border-hairline-volt" : "border-hairline"
              }`}
            >
              <div className="flex min-h-6 items-center justify-between gap-2">
                <label htmlFor={id} className="field-label">
                  {copy.seasons[each]}
                </label>
                {inForce && (
                  <span
                    data-testid="venue-pitch-cost-in-force"
                    className="rounded-pill border border-volt px-2 py-[1px] text-[10px] font-semibold uppercase tracking-wide text-volt"
                  >
                    {copy.inForce}
                  </span>
                )}
              </div>
              <div className="relative mt-2">
                <input
                  id={id}
                  name={FIELD_NAME[each]}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={values[each]}
                  onChange={(event) => {
                    const next = event.target.value;
                    setValues((previous) => ({ ...previous, [each]: next }));
                    setEditedSinceSave(true);
                  }}
                  aria-invalid={isInvalid || undefined}
                  aria-describedby={isInvalid ? `pitch-cost-error-${venueId}` : undefined}
                  data-testid={`venue-pitch-cost-input-${each}`}
                  className={`field w-full py-2 pl-3 pr-12 tabular-nums ${
                    isInvalid ? "border-danger" : ""
                  }`}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted"
                >
                  {copy.currency}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <PendingButton label={copy.costSave} testId="venue-pitch-cost-save" />
        {saved && (
          <p role="status" data-testid="venue-pitch-cost-saved" className="m-0 text-small text-volt">
            {copy.costSaved.replace("{amount}", formatCzk(pitchCostInForce(saved, season)))}
          </p>
        )}
      </div>

      {state.status === "error" && state.message && !editedSinceSave && (
        <p
          role="alert"
          id={`pitch-cost-error-${venueId}`}
          data-testid="venue-pitch-cost-error"
          className="mb-0 mt-3 text-small text-bone"
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
