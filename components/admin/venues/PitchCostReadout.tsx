import { PITCH_SEASONS, type PitchCostPair } from "@/lib/admin/venues/pitchCosts";
import { formatCzk } from "@/lib/format";
import type { PitchSeason } from "@/lib/types/database";
import { strings } from "@/lib/strings";

/**
 * A venue's two pitch costs, read-only (round 42, the admin rebuild) — on an
 * archived venue, which no new game can be created at. The season in force is
 * the volt one, as it is in the editable area.
 */
export function PitchCostReadout({ costs, season }: { costs: PitchCostPair; season: PitchSeason }) {
  const copy = strings.admin.pitch;
  const amounts: Record<PitchSeason, number> = { summer: costs.summerCzk, winter: costs.winterCzk };

  return (
    <div
      data-testid="venue-pitch-cost-readout"
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px]"
    >
      <span className="text-faint">{copy.costHeading}</span>
      <dl className="m-0 flex flex-wrap gap-x-3 gap-y-1">
        {PITCH_SEASONS.map((each) => (
          <div key={each} className="flex items-baseline gap-[6px]">
            <dt className="text-muted">{copy.seasons[each]}</dt>
            <dd
              data-in-force={each === season ? "true" : "false"}
              className={`m-0 tabular-nums ${each === season ? "font-semibold text-volt" : "text-bone"}`}
            >
              {formatCzk(amounts[each])}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
