import type { Metadata } from "next";
import Link from "next/link";
import { ExportCsvLink } from "@/components/admin/ExportCsvLink";
import { StatCard } from "@/components/admin/StatCard";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { formatCzk, formatDate } from "@/lib/format";
import { getAdminStats, ratio } from "@/lib/stats/queries";
import { readStatWindow, STAT_WINDOWS, type StatWindow } from "@/lib/stats/window";
import { strings } from "@/lib/strings";
import {
  FINANCIAL_PERIODS,
  getFinancials,
  isFinancialPeriod,
  type FinancialPeriod,
} from "@/lib/admin/financials";

export const metadata: Metadata = { title: strings.admin.financialsTitle };
export const dynamic = "force-dynamic";

const WINDOW_LABEL: Record<StatWindow, string> = {
  day: strings.admin.statWindowDay,
  week: strings.admin.statWindowWeek,
  month: strings.admin.statWindowMonth,
};

const PERIOD_LABEL: Record<FinancialPeriod, string> = {
  this_month: strings.admin.periodThisMonth,
  last_month: strings.admin.periodLastMonth,
  all_time: strings.admin.periodAllTime,
};

/**
 * `/admin/stats` — FINANCIALS (round 7, item 8), from `p19`.
 *
 * THE ROUTE DOES NOT MOVE, and item 0 is why. The audit filed `p19` as a new
 * page; checked against the route table it is this one — revenue, games
 * settled and average per game are the three questions the stats page already
 * answered. Adding `/admin/financials` beside it would be the "two surfaces
 * answering one question" the audit itself flagged, built on purpose.
 *
 * WHAT THE FRAME ADDS: a money-first arrangement, a period switcher instead of
 * the old six windows, a weekly shape, and an outstanding figure — which is
 * the one number here that answers "what should I chase".
 *
 * TWO AFFORDANCES FROM THE FRAME ARE OMITTED, per item 8's rule about
 * destinations that do not exist:
 *
 *   - `View unpaid →`. STILL OMITTED, confirmed by the owner in round 8.
 *     There is no unpaid-spots route in this product; unpaid bookings are
 *     settled per game on `/admin/games/[id]`. The FIGURE ships, because it
 *     answers the question; the link does not, because it would go nowhere.
 *     It lands when the surface is designed.
 *   - ~~`EXPORT CSV` on the transaction list.~~ **BUILT in round 8 item 3**,
 *     now that the columns are decided rather than guessed. See
 *     `app/admin/stats/transactions/route.ts` for why the file is wider than
 *     the list above it.
 */
export default async function FinancialsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const query = searchParams ? await searchParams : {};
  const requested = typeof query.period === "string" ? query.period : undefined;
  const period: FinancialPeriod = isFinancialPeriod(requested) ? requested : "this_month";

  // The clock is read in the data layer, which hands back the bounds it used —
  // the page cannot read it during render, and the label and the figures must
  // describe the same month.
  const f = await getFinancials(period);

  /*
   * THE OPERATIONAL METRICS SURVIVE, AND RESTORING THEM IS THE POINT.
   *
   * The first version of this page replaced the stats page outright with
   * `p19`'s money content — and silently deleted fill rate, no-show,
   * new/returning and cancellations, which no item asked for and which the
   * admin suite immediately failed on. `p19` overlaps `/admin/stats` on
   * REVENUE and on nothing else; the audit's own flag 9 said as much.
   *
   * So one page does both jobs and no route is added. Money first, because
   * that is what the frame makes the page about, and operations beneath it
   * under their own heading.
   *
   * TWO PICKERS, and they are genuinely two questions. "This month vs last"
   * is how money is read; day/week/month/quarter is how a fill rate is read,
   * and collapsing them would make one of the two answer the wrong window.
   * Each sits directly above the block it governs.
   */
  const window = readStatWindow(query);
  const stats = await getAdminStats(window);
  const { range, noShow, fillRate, confirmedRevenueCzk, newReturning, cancellations } =
    stats;

  const isEmpty =
    fillRate.capacity === 0 &&
    noShow.marked === 0 &&
    confirmedRevenueCzk === 0 &&
    newReturning.newPlayers + newReturning.returning === 0 &&
    cancellations.total === 0;

  /*
   * The delta the frame prints as "+12% vs July".
   *
   * NOT RENDERED WHEN THE PREVIOUS PERIOD WAS ZERO. A jump from nothing to
   * something is not a percentage — it is division by zero, and "+Infinity%"
   * or a silent "+100%" are both lies about a first month.
   */
  const delta =
    f.previousRevenueCzk !== null && f.previousRevenueCzk > 0
      ? Math.round(((f.revenueCzk - f.previousRevenueCzk) / f.previousRevenueCzk) * 100)
      : null;

  const peak = Math.max(1, ...f.weeks.map((w) => w.revenueCzk));

  return (
    <>
      <h2 className="m-0 font-display text-page-title uppercase tracking-wide text-white">
        {strings.admin.financialsTitle}
      </h2>

      {/* The period switcher — three pills, as p19 draws them. */}
      <nav data-testid="financial-period" className="mt-5 flex flex-wrap gap-2">
        {FINANCIAL_PERIODS.map((option) => {
          const selected = option === period;
          return (
            <Link
              key={option}
              href={`/admin/stats?period=${option}`}
              data-testid={`period-${option}`}
              data-selected={selected ? "true" : "false"}
              aria-current={selected ? "page" : undefined}
              className={`rounded-pill border-2 px-4 py-2 text-small font-semibold no-underline transition-colors ${
                selected
                  ? "border-volt bg-volt text-ink"
                  : "border-hairline-strong text-muted hover:border-volt hover:text-volt"
              }`}
            >
              {PERIOD_LABEL[option]}
            </Link>
          );
        })}
      </nav>

      {/* --- revenue, loud (p19) ------------------------------------------ */}
      <section data-testid="financials-revenue" className="lifted mt-5 rounded-card p-5">
        <div className="text-eyebrow font-semibold uppercase text-muted">
          {strings.admin.revenueLabel}
        </div>
        {/*
          Anton at display scale, which is R5's first named case exactly:
          "hero money figures".
        */}
        <div className="mt-2 font-display text-[40px] leading-none text-volt">
          {formatCzk(f.revenueCzk)}
        </div>
        {delta !== null && (
          <div data-testid="revenue-delta" className="mt-2 text-small">
            <span className={delta >= 0 ? "font-bold text-volt" : "font-bold text-warn"}>
              {delta >= 0 ? "+" : ""}
              {delta}%
            </span>{" "}
            <span className="text-muted">{strings.admin.revenueVsPrevious}</span>
          </div>
        )}
      </section>

      {/* --- two tiles ----------------------------------------------------- */}
      <section className="mt-4 grid grid-cols-2 gap-4">
        <div data-testid="financials-settled" className="lifted rounded-card p-5">
          <div className="text-eyebrow font-semibold uppercase text-muted">
            {strings.admin.gamesSettledLabel}
          </div>
          <div className="mt-2 font-display text-[32px] leading-none text-white">
            {f.gamesSettled}
          </div>
        </div>
        <div data-testid="financials-average" className="lifted rounded-card p-5">
          <div className="text-eyebrow font-semibold uppercase text-muted">
            {strings.admin.avgPerGameLabel}
          </div>
          {/*
            A dash rather than 0 when nothing settled. "0 CZK average" reads as
            a business problem; "—" reads as an empty window, which is what it
            is.
          */}
          <div className="mt-2 font-display text-[32px] leading-none text-white">
            {f.avgPerGameCzk === null ? "—" : formatCzk(f.avgPerGameCzk)}
          </div>
        </div>
      </section>

      {/* --- revenue by week ----------------------------------------------- */}
      {f.weeks.length > 0 && (
        <section data-testid="financials-weeks" className="lifted mt-4 rounded-card p-5">
          <div className="text-eyebrow font-semibold uppercase text-muted">
            {strings.admin.revenueByWeek}
          </div>
          {/*
            BARS AS DIVS, NOT A CHART LIBRARY. Four values with no axis, no
            tooltip and no interaction is a bar chart in the same sense a
            progress bar is: `height` is the only variable, and the alternative
            is shipping a charting dependency to draw four rectangles.

            The heights are a percentage of the tallest bar, which is the only
            place in this file an inline style is correct — it is a computed
            value per render, not a static one.
          */}
          {/*
            THE COLUMN OWNS THE HEIGHT, NOT THE ROW — and the first version got
            this wrong in a way worth recording: the bars did not render at
            all. A percentage height resolves against a parent with a DEFINITE
            height, and the bar's wrapper was a `flex-1` box inside an
            auto-height column, so every bar computed to zero and the chart was
            an empty grey panel with labels under it. It looked like "no data".

            Now each column is `h-full` inside the fixed-height row and the bar
            is a percentage of the column. Labels sit in their own row beneath,
            outside the measured area, so they cannot eat into it.
          */}
          <div className="mt-4 flex items-end gap-3" style={{ height: 120 }}>
            {f.weeks.map((week) => (
              <div key={week.label} className="flex h-full flex-1 flex-col justify-end">
                <div
                  data-testid={`week-bar-${week.label}`}
                  title={formatCzk(week.revenueCzk)}
                  className={`w-full rounded-control ${
                    week.revenueCzk > 0 && week.revenueCzk === peak
                      ? "bg-volt"
                      : "bg-volt/[.35]"
                  }`}
                  /* A 2% floor so an empty week is a visible baseline rather
                     than a gap the eye reads as a missing bar. */
                  style={{ height: `${Math.max(2, (week.revenueCzk / peak) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-3">
            {f.weeks.map((week) => (
              <div
                key={week.label}
                className="flex-1 text-center text-eyebrow font-semibold uppercase text-muted"
              >
                {week.label}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* --- outstanding ---------------------------------------------------- */}
      <section
        data-testid="financials-outstanding"
        className="mt-4 rounded-card border-2 border-hairline-volt bg-surface-raised p-5"
      >
        <div className="text-eyebrow font-semibold uppercase text-muted">
          {strings.admin.outstandingLabel}
        </div>
        <div className="mt-2 text-body-lg font-bold text-white">
          {formatCzk(f.outstandingCzk)} ·{" "}
          {strings.admin.unpaidSpots.replace("{count}", String(f.unpaidSpots))}
        </div>
        {/* The frame's `View unpaid →` is omitted — see the file header. */}
        <p className="m-0 mt-2 text-small text-muted">{strings.admin.unpaidWhere}</p>
      </section>

      {/* --- recent transactions -------------------------------------------- */}
      <section data-testid="financials-transactions" className="lifted mt-4 rounded-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-eyebrow font-semibold uppercase text-muted">
            {strings.admin.recentTransactions}
          </div>
          {/*
            p19's EXPORT CSV, built in round 8 item 3. It is NOT this list:
            the page shows the last eight ledger movements and the file is
            every booking and every top-up, because the columns the item names
            — method, game/pass reference — are properties of a payment rather
            than of a ledger row.
          */}
          <ExportCsvLink href="/admin/stats/transactions" testId="export-transactions" />
        </div>
        {f.transactions.length === 0 ? (
          <p className="m-0 mt-3 text-small text-muted">{strings.admin.noTransactions}</p>
        ) : (
          <ul className="m-0 mt-3 list-none p-0">
            {f.transactions.map((tx) => (
              <li
                key={tx.id}
                className="flex items-center justify-between gap-3 border-b border-hairline py-3 last:border-b-0 last:pb-0"
              >
                <span className="min-w-0">
                  <span className="block truncate text-body font-semibold text-white">
                    {tx.who}
                  </span>
                  <span className="block truncate text-small text-muted">{tx.what}</span>
                </span>
                <span
                  className={`shrink-0 text-body font-bold ${
                    tx.amountCzk >= 0 ? "text-volt" : "text-muted"
                  }`}
                >
                  {tx.amountCzk >= 0 ? "+" : "−"}
                  {formatCzk(Math.abs(tx.amountCzk))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- operations ------------------------------------------------------
          Everything the stats page has always answered, unchanged and under
          its own window. See the note where `window` is read. */}
      <section className="mt-10 border-t border-hairline pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="m-0 font-display text-section-title uppercase tracking-wide text-white">
            {strings.admin.operationsTitle}
          </h3>
          {/*
            THE OPERATIONS EXPORT, restored. Rewriting this page's header
            dropped it, and the suite caught it — a working route
            (`/admin/stats/export`) with no way to reach it. It carries the
            SELECTED window, so the file matches the screen it was taken from
            rather than a default period.

            It sits with OPERATIONS rather than at the top of the page because
            that is the data it exports. The frame's `EXPORT CSV` on the
            transactions list is a different file and is still omitted — see
            the page header.
          */}
          <ExportCsvLink
            href={`/admin/stats/export?window=${window}`}
            testId="export-stats"
          />
        </div>
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
              className={`rounded-pill border px-3 py-2 text-[11px] uppercase tracking-[1px] no-underline ${
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
      <p data-testid="stat-range" className="mt-2 text-[11px] text-faint">
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
          className="mt-8 text-[12px] tracking-[1px] text-faint"
        >
          {strings.admin.statsEmptyWindow}
        </p>
      ) : (
        <section className="mt-8">
          {/* Two-up on a phone, per the reference. */}
          <div className="grid grid-cols-2 gap-3">
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
      </section>
    </>
  );
}
