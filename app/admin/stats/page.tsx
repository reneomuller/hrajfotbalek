import { StatCard } from "@/components/admin/StatCard";
import { formatCzk, formatGameDateTime } from "@/lib/format";
import { getAdminStats, ratio } from "@/lib/stats/queries";
import { strings } from "@/lib/strings";

export const dynamic = "force-dynamic";

/**
 * `/admin/stats` — read-only, gated by the admin layout.
 *
 * Six metric groups, all of them aggregates over the append-only event log and
 * the tables. There is no write on this page and no action attached to it.
 */
export default async function AdminStatsPage() {
  const stats = await getAdminStats();
  const { funnel, conversion, noShow, dropOff, waitlistDepth } = stats;

  return (
    <>
      <h2 className="m-0 font-condensed text-[22px] font-bold uppercase tracking-wide text-bone">
        {strings.admin.statsTitle}
      </h2>
      <p className="mt-2 max-w-[560px] text-[13px] leading-relaxed text-muted-dim">
        {strings.admin.statsLede}
      </p>

      {/* --- funnel ------------------------------------------------------------ */}
      <section className="mt-8">
        <div className="flex flex-wrap gap-4">
          <StatCard
            testId="stat-signups"
            label={strings.admin.statFunnelSignups}
            value={String(funnel.signups)}
          />
          <StatCard
            testId="stat-first-booking"
            label={strings.admin.statFunnelBooked}
            value={String(funnel.firstBookings)}
            detail={`${ratio(funnel.firstBookings, funnel.signups)} ${strings.admin.statOf} ${funnel.signups}`}
          />
          <StatCard
            testId="stat-attended"
            label={strings.admin.statFunnelAttended}
            value={String(funnel.attended)}
            hint={strings.admin.statFunnel}
          />
        </div>
      </section>

      {/* --- money and behaviour ----------------------------------------------- */}
      <section className="mt-4">
        <div className="flex flex-wrap gap-4">
          <StatCard
            testId="stat-conversion"
            label={strings.admin.statConversion}
            value={ratio(conversion.paymentsConfirmed, conversion.bookingsCreated)}
            detail={`${conversion.paymentsConfirmed} ${strings.admin.statOf} ${conversion.bookingsCreated}`}
            hint={strings.admin.statConversionHint}
          />
          <StatCard
            testId="stat-no-show"
            label={strings.admin.statNoShow}
            value={ratio(noShow.noShows, noShow.marked)}
            detail={`${noShow.noShows} ${strings.admin.statOf} ${noShow.marked}`}
            hint={strings.admin.statNoShowHint}
          />
          <StatCard
            testId="stat-credit"
            label={strings.admin.statCredit}
            value={formatCzk(stats.creditOutstandingCzk)}
            hint={strings.admin.statCreditHint}
          />
          <StatCard
            testId="stat-drop-off"
            label={strings.admin.statDropOff}
            value={ratio(dropOff.completed, dropOff.linksSent)}
            detail={`${dropOff.completed} ${strings.admin.statOf} ${dropOff.linksSent}`}
            hint={strings.admin.statDropOffHint}
          />
        </div>
      </section>

      {/* --- waitlist depth ----------------------------------------------------
          Per game, not averaged: an average hides the one game everybody wants,
          which is exactly the game the number exists to find. */}
      <section className="mt-10">
        <h3 className="m-0 font-condensed text-[18px] font-bold uppercase tracking-wide text-bone">
          {strings.admin.statWaitlist}
        </h3>
        <p className="mt-1 text-[12px] text-muted-dim">{strings.admin.statWaitlistHint}</p>

        {waitlistDepth.length === 0 ? (
          <p className="mt-4 font-mono text-[12px] tracking-[1px] text-faint">
            {strings.admin.statWaitlistEmpty}
          </p>
        ) : (
          <ul className="mt-4 list-none space-y-2 p-0">
            {waitlistDepth.map((row) => (
              <li
                key={row.gameId}
                data-testid="stat-waitlist-row"
                data-waiting={row.waiting}
                className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-hairline px-5 py-3"
              >
                <span className="font-condensed text-[16px] font-bold text-white">
                  {row.venue}
                </span>
                <span className="font-mono text-[11px] tracking-[1px] text-muted">
                  {formatGameDateTime(row.startsAt)}
                </span>
                <span
                  className={`font-mono text-[18px] font-bold ${
                    row.waiting > 0 ? "text-volt" : "text-faint"
                  }`}
                >
                  {row.waiting}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
