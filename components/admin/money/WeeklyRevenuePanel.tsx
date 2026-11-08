import { Panel } from "@/components/admin/ui/Panel";
import type { WeekBar } from "@/lib/admin/financials";
import { formatCzk } from "@/lib/format";
import { strings } from "@/lib/strings";

/**
 * Revenue by week inside the month (round 7's `p19`, restyled in the round 42
 * rebuild), with each week's amount printed under its bar so the chart can be
 * read on a phone, where there is no hover.
 *
 * BARS AS DIVS, NOT A CHART LIBRARY. Five values with no axis and no
 * interaction is a bar chart in the same sense a progress bar is: `height` is
 * the only variable, and the alternative is shipping a charting dependency to
 * draw five rectangles. The heights are a percentage of the tallest bar — the
 * only inline style here, because it is the data.
 *
 * THE COLUMN OWNS THE HEIGHT, NOT THE ROW. A percentage height resolves
 * against a parent with a DEFINITE height; the first version put each bar in
 * an auto-height wrapper, every bar computed to zero, and the chart was an
 * empty panel that looked like "no data". Each column is `h-full` inside the
 * fixed-height row, and the labels sit beneath it, outside the measured area.
 */
const MIN_BAR_PERCENT = 2;
const FULL = 100;

export function WeeklyRevenuePanel({ weeks }: { weeks: WeekBar[] }) {
  const peak = Math.max(1, ...weeks.map((week) => week.revenueCzk));

  return (
    <Panel title={strings.admin.revenueByWeek} testId="financials-weeks">
      <p className="-mt-1 mb-4 text-small text-muted">{strings.admin.money.weeksLede}</p>
      <div className="flex h-[120px] items-end gap-3">
        {weeks.map((week) => (
          <div key={week.label} className="flex h-full flex-1 flex-col justify-end">
            <div
              data-testid={`week-bar-${week.label}`}
              title={formatCzk(week.revenueCzk)}
              className={`w-full rounded-control ${
                week.revenueCzk > 0 && week.revenueCzk === peak ? "bg-volt" : "bg-volt/[.35]"
              }`}
              /* A floor so an empty week is a visible baseline rather than a
                 gap the eye reads as a missing bar. */
              style={{ height: `${Math.max(MIN_BAR_PERCENT, (week.revenueCzk / peak) * FULL)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-3">
        {weeks.map((week) => (
          <div key={week.label} className="min-w-0 flex-1 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-[1px] text-muted">{week.label}</div>
            <div className="mt-[2px] text-[10px] leading-tight tabular-nums text-bone">
              {formatCzk(week.revenueCzk)}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
