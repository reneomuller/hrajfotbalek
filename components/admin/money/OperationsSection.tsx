import { ExportCsvLink } from "@/components/admin/ExportCsvLink";
import { StatCard } from "@/components/admin/StatCard";
import { ChipLinks } from "@/components/admin/money/ChipLinks";
import type { FinancialPeriod } from "@/lib/admin/financials";
import { statsHref } from "@/lib/admin/money/statsHref";
import { formatCzk, formatDate } from "@/lib/format";
import { ratio, type AdminStats } from "@/lib/stats/queries";
import { STAT_WINDOWS, type StatWindow } from "@/lib/stats/window";
import { strings } from "@/lib/strings";

/**
 * OPERATIONS — everything the stats page has always answered (Phase 19), under
 * its own window: fill rate, confirmed revenue, no-show rate, new vs
 * returning, cancellations, and their export.
 *
 * TWO PICKERS ON ONE PAGE, and they are genuinely two questions. "This month
 * vs last" is how money is read; today / this week / this month is how a fill
 * rate is read, and collapsing them would make one answer the wrong window.
 * Each sits directly above the block it governs, and each link keeps the
 * other's choice.
 *
 * THE EXPORT CARRIES THE SELECTED WINDOW, so the file matches the screen it
 * was taken from rather than a default period.
 */
const WINDOW_LABEL: Record<StatWindow, string> = {
  day: strings.admin.statWindowDay,
  week: strings.admin.statWindowWeek,
  month: strings.admin.statWindowMonth,
};

export function OperationsSection({
  stats,
  window,
  period,
}: {
  stats: AdminStats;
  window: StatWindow;
  period: FinancialPeriod;
}) {
  const { range, fillRate, confirmedRevenueCzk, newReturning, cancellations } = stats;
  const copy = strings.admin;

  const isEmpty =
    fillRate.capacity === 0 &&
    confirmedRevenueCzk === 0 &&
    newReturning.newPlayers + newReturning.returning === 0 &&
    cancellations.total === 0;

  return (
    <section data-testid="money-operations" className="mt-10 border-t border-hairline pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 font-display text-section-title uppercase tracking-wide text-white">
            {copy.operationsTitle}
          </h2>
          <p className="mt-1 text-small text-muted">{copy.money.operationsLede}</p>
        </div>
        <ExportCsvLink href={`/admin/stats/export?window=${window}`} testId="export-stats" />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <ChipLinks
          testId="stat-window-picker"
          label={copy.money.windowLabel}
          current={window}
          chips={STAT_WINDOWS.map((option) => ({
            key: option,
            label: WINDOW_LABEL[option],
            href: statsHref(period, option),
            testId: `stat-window-${option}`,
          }))}
        />
        {/* The bounds, stated. A metric with an invisible window is a metric
            two people can read differently and both be right. The upper bound
            is exclusive, so the last day INSIDE the window is the one before
            it — printing the bound itself would claim a day the numbers do not
            include. */}
        <p data-testid="stat-range" className="m-0 text-[12px] tabular-nums text-faint">
          {copy.statWindowRange
            .replace("{from}", formatDate(range.from))
            .replace("{to}", formatDate(new Date(Date.parse(range.to) - 1)))}
        </p>
      </div>

      {isEmpty ? (
        /* In place of every tile when the window holds nothing. "Today"
           legitimately holds nothing most days, and a page of dashes reads as
           broken rather than as empty. */
        <p data-testid="stats-empty" className="mt-6 text-[12px] tracking-[1px] text-faint">
          {copy.statsEmptyWindow}
        </p>
      ) : (
        /* Two-up on a phone; on a desktop fill and revenue across the top, the
           player and cancellation tiles beneath them. ~~No-show rate~~ — gone
           with attendance (2026-11-09). */
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-6">
          <StatCard
            testId="stat-fill-rate"
            className="md:col-span-3"
            label={copy.statFillRate}
            value={ratio(fillRate.sold, fillRate.capacity)}
            detail={`${fillRate.sold} ${copy.statOf} ${fillRate.capacity}`}
            hint={copy.money.fillRateHint}
          />
          <StatCard
            testId="stat-revenue"
            className="md:col-span-3"
            label={copy.statRevenue}
            value={formatCzk(confirmedRevenueCzk)}
            hint={copy.statRevenueHint}
          />
          <StatCard
            testId="stat-new-returning"
            className="col-span-2 md:col-span-3"
            label={copy.statNewReturning}
            value={`${newReturning.newPlayers} / ${newReturning.returning}`}
            detail={`${copy.statNew} / ${copy.statReturning}`}
            hint={copy.money.newReturningHint}
          />
          <StatCard
            testId="stat-cancellations"
            className="col-span-2 md:col-span-3"
            label={copy.statCancellations}
            value={String(cancellations.total)}
            detail={`${cancellations.withCredit} ${copy.statCancellationsWithCredit}`}
            hint={copy.statCancellationsHint}
          />
        </div>
      )}
    </section>
  );
}
