"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { setPitchSeasonAction, type PitchSeasonState } from "@/app/admin/venues/actions";
import { Panel } from "@/components/admin/ui/Panel";
import { PITCH_SEASONS, parsePitchSeason } from "@/lib/admin/venues/pitchCosts";
import type { PitchSeason } from "@/lib/types/database";
import { strings } from "@/lib/strings";

const INITIAL: PitchSeasonState = { status: "idle" };

/**
 * The one season switch for every venue (round 42, the admin rebuild) — the
 * owner's "simple toggle that either stays on winter or summer".
 *
 * ONE TAP, NO SAVE BUTTON. Each segment is a submit button carrying its
 * season, so pressing the other one is the whole change. Both stay
 * `type="submit"` for good: a button whose type flips during its own click
 * submits the form (CLAUDE.md, Remove credit). Pressing the current one sends
 * the season it already is, which `set_pitch_season` takes as a no-op.
 *
 * THE SERVER SAYS WHICH IS CURRENT. `current` is the page's read of
 * `pitch_settings`; while a press is in flight the pressed segment shows as
 * chosen, and the re-render the action triggers then carries the real answer.
 */
export function PitchSeasonSwitch({
  current,
  className = "",
}: {
  current: PitchSeason;
  className?: string;
}) {
  const [state, formAction] = useActionState(setPitchSeasonAction, INITIAL);
  const copy = strings.admin.pitch;

  return (
    <Panel title={copy.seasonHeading} testId="pitch-season-panel" className={className}>
      <form
        action={formAction}
        data-testid="pitch-season-form"
        data-season={current}
        className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-8"
      >
        <fieldset className="m-0 shrink-0 border-0 p-0">
          <legend className="mb-2 p-0 text-small font-semibold text-bone">{copy.seasonLegend}</legend>
          <Segments current={current} />
        </fieldset>
        <p className="m-0 max-w-[520px] text-[12px] leading-relaxed text-muted md:text-right">
          {copy.seasonHint}
        </p>
      </form>

      {state.status === "saved" && state.season === current && (
        <p role="status" data-testid="pitch-season-saved" className="mb-0 mt-3 text-small text-volt">
          {copy.seasonSaved[current]}
        </p>
      )}
      {state.status === "error" && state.message && (
        <p role="alert" data-testid="pitch-season-error" className="mb-0 mt-3 text-small text-bone">
          {state.message}
        </p>
      )}
    </Panel>
  );
}

/**
 * The two segments, drawn as the admin nav's chips in one track: a volt ring
 * marks the season in force, nothing else does.
 */
function Segments({ current }: { current: PitchSeason }) {
  const { pending, data } = useFormStatus();
  const shown = (pending && parsePitchSeason(data?.get("season"))) || current;

  return (
    <div className="inline-flex gap-1 rounded-pill border border-hairline-strong bg-surface p-1">
      {PITCH_SEASONS.map((season) => {
        const chosen = season === shown;
        return (
          <button
            key={season}
            type="submit"
            name="season"
            value={season}
            aria-pressed={chosen}
            disabled={pending}
            data-testid={`pitch-season-${season}`}
            className={`min-h-11 min-w-[104px] rounded-pill border px-5 text-small font-semibold transition-colors disabled:cursor-wait ${
              chosen
                ? "border-volt text-volt"
                : "border-transparent text-muted hover:text-bone active:text-bone"
            }`}
          >
            {strings.admin.pitch.seasons[season]}
          </button>
        );
      })}
    </div>
  );
}
