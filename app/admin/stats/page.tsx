import type { Metadata } from "next";
import { StatCard } from "@/components/admin/StatCard";
import { RevenueSplitCard } from "@/components/admin/money/RevenueSplitCard";
import { ChipLinks } from "@/components/admin/money/ChipLinks";
import { LedgerPanel } from "@/components/admin/money/LedgerPanel";
import { OperationsSection } from "@/components/admin/money/OperationsSection";
import { ProfitPerGamePanel } from "@/components/admin/money/ProfitPerGamePanel";
import { RevenueMixPanel } from "@/components/admin/money/RevenueMixPanel";
import { WeeklyRevenuePanel } from "@/components/admin/money/WeeklyRevenuePanel";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { appCapabilities } from "@/lib/db/capabilities";
import { formatCzk, formatDate } from "@/lib/format";
import { getAdminStats } from "@/lib/stats/queries";
import { readStatWindow } from "@/lib/stats/window";
import { strings } from "@/lib/strings";
import {
  FINANCIAL_PERIODS,
  getFinancials,
  isFinancialPeriod,
  type FinancialPeriod,
  type PeriodBounds,
} from "@/lib/admin/financials";
import { getPeriodEconomics } from "@/lib/admin/money/periodEconomics";
import { statsHref } from "@/lib/admin/money/statsHref";

/* The title is the admin nav's own word for this route, so the chip and the
   heading say the same thing. */
export const metadata: Metadata = { title: strings.admin.navStats };
export const dynamic = "force-dynamic";

const PERIOD_LABEL: Record<FinancialPeriod, string> = {
  this_month: strings.admin.periodThisMonth,
  last_month: strings.admin.periodLastMonth,
  all_time: strings.admin.periodAllTime,
};

/** The stretch of time the money figures cover, for the header's line. */
function periodLede(bounds: PeriodBounds): string {
  if (!bounds.from || !bounds.to) return strings.admin.money.allTimeLede;
  return strings.admin.money.periodRange
    .replace("{from}", formatDate(bounds.from))
    // EXCLUSIVE upper bound: the last day inside the month is the one before.
    .replace("{to}", formatDate(Date.parse(bounds.to) - 1));
}

/**
 * `/admin/stats` — FINANCIALS: the money page (round 7's `p19`, rebuilt in
 * round 42).
 *
 * THE ROUTE DOES NOT MOVE. Revenue, games settled and average per game were
 * questions this page already answered; a second money route beside it would
 * be two surfaces answering one question.
 *
 * TOP TO BOTTOM, the order the owner reads it in:
 *   1. the header, the period it covers, and the period switcher;
 *   2. four tiles — revenue (with the change on the period before), games
 *      settled, the average per game, and what is still owed;
 *   3. PROFIT PER GAME — "I do want the profit and break-even per game";
 *   4. REVENUE BY HOW IT WAS PAID — a single game against "a credit from a
 *      game pass that'd make their entry cheaper" — beside revenue by week;
 *   5. the recent Credit ledger and the transactions export;
 *   6. OPERATIONS under its own window: fill rate, no-show, new vs returning,
 *      cancellations, and their export.
 *
 * 3 and 4's mix wait for `app_capabilities().pitchCosts`: the functions behind
 * them are created by `20261108100000_pitch_costs.sql`, which the owner
 * applies by hand, and until then neither panel renders.
 *
 * WHAT IS DELIBERATELY NOT HERE, by the owner's word: a monthly P&L, a "credit
 * we owe players" figure ("we don't owe players any credit"), a funnel and
 * marketing.
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
  const window = readStatWindow(query);

  // The clock is read in the data layer, which hands back the bounds it used —
  // the page cannot read it during render, and the label and the figures must
  // describe the same month. The economics are read against THOSE bounds.
  const caps = await appCapabilities();
  const [f, stats] = await Promise.all([
    getFinancials(period, { economics: caps.pitchCosts }),
    getAdminStats(window),
  ]);
  const economics = caps.pitchCosts ? await getPeriodEconomics(f.bounds) : null;

  /*
   * The change on the period before, as "+12% vs the month before".
   *
   * NOT RENDERED WHEN THE PREVIOUS PERIOD WAS ZERO. A jump from nothing to
   * something is not a percentage — it is division by zero, and "+Infinity%"
   * or a silent "+100%" are both lies about a first month.
   */
  const delta =
    f.previousRevenueCzk !== null && f.previousRevenueCzk > 0
      ? Math.round(((f.revenueCzk - f.previousRevenueCzk) / f.previousRevenueCzk) * 100)
      : null;

  const hasWeeks = f.weeks.length > 0;

  return (
    <>
      <PageHeader
        title={strings.admin.navStats}
        lede={periodLede(f.bounds)}
        actions={
          <ChipLinks
            testId="financial-period"
            label={strings.admin.money.periodLabel}
            current={period}
            chips={FINANCIAL_PERIODS.map((option) => ({
              key: option,
              label: PERIOD_LABEL[option],
              href: statsHref(option, window),
              testId: `period-${option}`,
            }))}
          />
        }
      />

      {/*
        TWO BY TWO (the owner, 2026-11-08): the two revenue boxes on top — the
        total and what it paid for — and the average per game and the games
        played beneath. ~~Outstanding~~ is gone: "it is redundant. everyone
        pays up front."
      */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <StatCard
          testId="financials-revenue"
          label={strings.admin.revenueLabel}
          value={formatCzk(f.revenueCzk)}
          detail={
            delta === null ? undefined : (
              <span data-testid="revenue-delta">
                <span className={delta >= 0 ? "font-bold text-volt" : "font-bold text-warn"}>
                  {delta >= 0 ? "+" : "−"}
                  {Math.abs(delta)}%
                </span>{" "}
                {strings.admin.revenueVsPrevious}
              </span>
            )
          }
          hint={strings.admin.money.revenueHint}
        />
        <RevenueSplitCard split={f.revenueSplit} />
        {/* A dash rather than 0 when nothing was played. "0 CZK average" reads
            as a business problem; "—" reads as an empty window. */}
        <StatCard
          testId="financials-average"
          tone="white"
          label={strings.admin.avgPerGameLabel}
          value={f.avgPerGameCzk === null ? "—" : formatCzk(f.avgPerGameCzk)}
          hint={strings.admin.money.avgHint}
        />
        <StatCard
          testId="financials-settled"
          tone="white"
          label={strings.admin.money.gamesPlayedLabel}
          value={String(f.gamesPlayed)}
          hint={strings.admin.money.playedHint}
        />
      </div>

      <div className="mt-4 flex flex-col gap-4">
        {economics && (
          <ProfitPerGamePanel rows={economics.rows} totals={economics.totals} seats={economics.seats} />
        )}

        {(economics || hasWeeks) && (
          <div className={`grid gap-4 ${economics && hasWeeks ? "md:grid-cols-2" : ""}`}>
            {economics && <RevenueMixPanel mix={economics.mix} />}
            {hasWeeks && <WeeklyRevenuePanel weeks={f.weeks} />}
          </div>
        )}

        <LedgerPanel transactions={f.transactions} />
      </div>

      <OperationsSection stats={stats} window={window} period={period} />
    </>
  );
}
