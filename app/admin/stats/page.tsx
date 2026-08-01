import Link from "next/link";
import { StatCard } from "@/components/admin/StatCard";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { formatCzk, formatDate } from "@/lib/format";
import { getAdminStats, ratio } from "@/lib/stats/queries";
import { readStatWindow, STAT_WINDOWS, type StatWindow } from "@/lib/stats/window";
import { strings } from "@/lib/strings";

export const metadata = { title: strings.admin.statsTitle };

export const dynamic = "force-dynamic";

const WINDOW_LABEL: Record<StatWindow, string> = {
  day: strings.admin.statWindowDay,
  week: strings.admin.statWindowWeek,
  month: strings.admin.statWindowMonth,
};

/**
 * `/admin/stats` — read-only, gated by the admin layout.
 *
 * FIVE METRICS, ALL BOUNDED (§7, REQ-ADMIN-005/006). Before Phase 19 every
 * number here was since-the-beginning-of-time, which is a figure that can only
 * go up and therefore says nothing about whether anything is working.
 *
 * The window is a `?window=` link rather than client state, for the same
 * reasons the games list's day picker is: the selection is shareable, the back
 * button is correct, and the filtering stays where the data is. `requireAdmin()`
 * runs here as well as in the layout — the clock is read once, in this
 * function, and handed to the pure range helpers.
 */
export default async function AdminStatsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const query = searchParams ? await searchParams : {};

  const window = readStatWindow(query);
  // The clock is read in the query layer, which hands back the exact bounds the
  // numbers were computed against — so the label and the figures cannot end up
  // describing different periods.
  const stats = await getAdminStats(window);

  const { range, noShow, fillRate, confirmedRevenueCzk, newReturning, cancellations } =
    stats;

  // A window can legitimately hold nothing — "today" usually does — and a page
  // of dashes reads as broken rather than as empty.
  const isEmpty =
    fillRate.capacity === 0 &&
    noShow.marked === 0 &&
    confirmedRevenueCzk === 0 &&
    newReturning.newPlayers + newReturning.returning === 0 &&
    cancellations.total === 0;

  return (
    <>
      <h2 className="m-0 font-condensed text-[22px] font-bold uppercase tracking-wide text-bone">
        {strings.admin.statsTitle}
      </h2>
      <p className="mt-2 max-w-[560px] text-[13px] leading-relaxed text-muted-dim">
        {strings.admin.statsLede}
      </p>

      {/* --- the window -------------------------------------------------------- */}
      <nav data-testid="stat-window-picker" className="mt-6 flex flex-wrap gap-2">
        {STAT_WINDOWS.map((option) => {
          const isSelected = option === window;
          return (
            <Link
              key={option}
              href={`/admin/stats?window=${option}`}
              data-testid={`stat-window-${option}`}
              data-selected={isSelected ? "true" : "false"}
              aria-current={isSelected ? "page" : undefined}
              className={`rounded-chip border px-3 py-2 font-mono text-[11px] uppercase tracking-[1px] no-underline ${
                isSelected
                  ? "border-hairline-volt bg-volt text-surface"
                  : "border-hairline-strong text-muted"
              }`}
            >
              {WINDOW_LABEL[option]}
            </Link>
          );
        })}
      </nav>

      {/* The bounds, stated. A metric with an invisible window is a metric two
          people can read differently and both be right. */}
      <p data-testid="stat-range" className="mt-2 font-mono text-[11px] text-faint">
        {strings.admin.statWindowRange
          .replace("{from}", formatDate(range.from))
          // The upper bound is exclusive, so the last day INSIDE the window is
          // the one before it — printing the bound itself would claim a day the
          // numbers do not include.
          .replace("{to}", formatDate(new Date(Date.parse(range.to) - 1)))}
      </p>

      {isEmpty ? (
        <p
          data-testid="stats-empty"
          className="mt-8 font-mono text-[12px] tracking-[1px] text-faint"
        >
          {strings.admin.statsEmptyWindow}
        </p>
      ) : (
        <section className="mt-8">
          <div className="flex flex-wrap gap-4">
            <StatCard
              testId="stat-fill-rate"
              label={strings.admin.statFillRate}
              value={ratio(fillRate.sold, fillRate.capacity)}
              detail={`${fillRate.sold} ${strings.admin.statOf} ${fillRate.capacity}`}
              hint={strings.admin.statFillRateHint}
            />
            <StatCard
              testId="stat-revenue"
              label={strings.admin.statRevenue}
              value={formatCzk(confirmedRevenueCzk)}
              hint={strings.admin.statRevenueHint}
            />
            <StatCard
              testId="stat-no-show"
              label={strings.admin.statNoShow}
              value={ratio(noShow.noShows, noShow.marked)}
              detail={`${noShow.noShows} ${strings.admin.statOf} ${noShow.marked}`}
              hint={strings.admin.statNoShowHint}
            />
            <StatCard
              testId="stat-new-returning"
              label={strings.admin.statNewReturning}
              value={`${newReturning.newPlayers} / ${newReturning.returning}`}
              detail={`${strings.admin.statNew} / ${strings.admin.statReturning}`}
              hint={strings.admin.statNewReturningHint}
            />
            <StatCard
              testId="stat-cancellations"
              label={strings.admin.statCancellations}
              value={String(cancellations.total)}
              detail={`${cancellations.withCredit} ${strings.admin.statCancellationsWithCredit}`}
              hint={strings.admin.statCancellationsHint}
            />
          </div>
        </section>
      )}
    </>
  );
}
