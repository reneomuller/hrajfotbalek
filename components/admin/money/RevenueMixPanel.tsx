import { BreakdownBars, type BreakdownRow } from "@/components/admin/ui/BreakdownBars";
import { Panel } from "@/components/admin/ui/Panel";
import { countLabel } from "@/lib/admin/money/countLabel";
import { formatSeats } from "@/lib/admin/seatBar";
import type { RevenueMix } from "@/lib/admin/money/revenueMix";
import { formatCzk } from "@/lib/format";
import { strings } from "@/lib/strings";

/**
 * Revenue by how it was paid, for the games played in the period (round 42,
 * the admin rebuild) — the owner's "someone purchasing a single credit or
 * using a credit from a game pass that'd make their entry cheaper".
 *
 * Four rows, always four, so a month with no pass seats says "0" rather than
 * leaving the reader to wonder whether passes were counted at all. Under them
 * the average a seat brought, single against pass, and what the cheaper pass
 * entry came to in crowns.
 */
const copy = strings.admin.money;
const SEATS = { one: copy.seatsOne, many: copy.seatsMany };
const CANCELLATIONS = { one: copy.cancellationsOne, many: copy.cancellationsMany };

/* Two lines, so the count is never the part a 390px row truncates away. */
function Label({ name, count }: { name: string; count: string }) {
  return (
    <>
      <span className="block truncate">{name}</span>
      <span className="block text-[12px] tabular-nums text-faint">{count}</span>
    </>
  );
}

function Average({ label, czk, testId }: { label: string; czk: number | null; testId: string }) {
  return (
    <div>
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd data-testid={testId} className="m-0 mt-1 font-display text-[26px] leading-none tabular-nums text-white">
        {czk === null ? "—" : formatCzk(czk)}
      </dd>
    </div>
  );
}

export function RevenueMixPanel({ mix }: { mix: RevenueMix }) {
  const rows: BreakdownRow[] = [
    {
      key: "single",
      label: <Label name={copy.mixSingle} count={countLabel(mix.single.seats, SEATS)} />,
      value: mix.single.czk,
      display: formatCzk(mix.single.czk),
    },
    {
      key: "pass",
      label: <Label name={copy.mixPass} count={countLabel(mix.pass.seats, SEATS)} />,
      value: mix.pass.czk,
      display: formatCzk(mix.pass.czk),
    },
    {
      key: "credit",
      label: <Label name={copy.mixCredit} count={countLabel(mix.credit.seats, SEATS)} />,
      value: mix.credit.czk,
      display: formatCzk(mix.credit.czk),
    },
    {
      key: "kept",
      label: <Label name={copy.mixKept} count={countLabel(mix.kept.cancellations, CANCELLATIONS)} />,
      value: mix.kept.czk,
      display: formatCzk(mix.kept.czk),
    },
  ];

  const showGap = mix.passGapPerSeatCzk !== null && Math.round(mix.passGapPerSeatCzk) > 0;

  return (
    <Panel title={copy.mixTitle} testId="money-revenue-mix">
      <p className="-mt-1 mb-4 text-small text-muted">{copy.mixLede}</p>
      <BreakdownBars rows={rows} testId="money-mix" emptyText={copy.mixEmpty} />

      {mix.totalCzk > 0 && (
        <div className="mt-5 border-t border-hairline pt-4">
          <div className="text-[10px] uppercase tracking-eyebrow text-volt-dim">{copy.avgPerSeat}</div>
          <dl className="m-0 mt-3 grid grid-cols-2 gap-4">
            <Average label={copy.avgSingle} czk={mix.avgSingleCzk} testId="money-avg-single" />
            <Average label={copy.avgPass} czk={mix.avgPassCzk} testId="money-avg-pass" />
          </dl>
          {showGap && mix.passGapPerSeatCzk !== null && (
            <p data-testid="money-pass-gap" className="mb-0 mt-3 text-small text-bone">
              {copy.passGap.replace("{amount}", formatCzk(mix.passGapPerSeatCzk))}{" "}
              <span className="text-muted">
                {copy.passGapTotal
                  .replace("{amount}", formatCzk(mix.passGapTotalCzk))
                  .replace("{seats}", countLabel(mix.pass.seats, SEATS))}
              </span>
            </p>
          )}
          {mix.freeSeats > 0 && (
            <p className="mb-0 mt-2 text-[12px] text-faint">
              {copy.freeSeats.replace("{n}", formatSeats(mix.freeSeats))}
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
