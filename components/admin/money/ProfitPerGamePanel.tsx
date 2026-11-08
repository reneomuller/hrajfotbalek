import Link from "next/link";
import { Panel } from "@/components/admin/ui/Panel";
import { SignedCzk } from "@/components/admin/ui/Money";
import { SeatBar, SeatLegend } from "@/components/admin/ui/SeatBar";
import { countLabel } from "@/lib/admin/money/countLabel";
import type { ProfitRow, ProfitTotals } from "@/lib/admin/money/profitPerGame";
import { formatSeats, type SeatBarInput } from "@/lib/admin/seatBar";
import { formatCzk, formatDate } from "@/lib/format";
import { strings } from "@/lib/strings";

/**
 * Profit per game, for the games played in the period (round 42, the admin
 * rebuild) — the owner's "I do want the profit and break-even per game".
 *
 * ONE TABLE, TWO SHAPES. From `md` it is a real table: game, seats with the
 * break-even line, revenue, pitch cost, profit, break-even seats. Below `md`
 * the same rows stack — venue and profit on one line, the seat bar under them,
 * the three figures under that — because six columns do not fit 390px and a
 * table that scrolls sideways hides the column that matters. The roles are
 * spelled out because a table restyled as blocks loses them in Safari.
 *
 * Totals sit above the rows, where they are read first; a game with no pitch
 * cost shows a dash for its cost and its profit and is left out of both
 * totals, which the note under the table says.
 */
const copy = strings.admin.money;
const SEATS = { one: copy.seatsOne, many: copy.seatsMany };
const DASH = "—";

/** The column's name, shown only where the table has become stacked rows. */
function StackLabel({ children }: { children: string }) {
  return (
    <span className="block text-[10px] uppercase tracking-eyebrow text-faint md:hidden">{children}</span>
  );
}

function Total({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-control bg-surface-raised px-3 py-3">
      <dt className="text-[10px] uppercase tracking-eyebrow text-volt-dim">{label}</dt>
      <dd className="m-0 mt-2 font-display text-[22px] leading-none tabular-nums text-white">
        {children}
      </dd>
    </div>
  );
}

const TH = "px-3 py-2 text-[10px] font-normal uppercase tracking-eyebrow text-volt-dim";
const NUMBER_CELL = "col-span-2 tabular-nums md:table-cell md:whitespace-nowrap md:px-3 md:py-3 md:text-right md:align-middle";

function GameRow({ row }: { row: ProfitRow }) {
  const { game, economics } = row;
  const seatsLabel = strings.admin.seatBarLabel
    .replace("{taken}", formatSeats(economics.seatsTaken))
    .replace("{capacity}", String(economics.capacity));

  return (
    <tr
      role="row"
      data-testid="money-profit-row"
      data-game-id={game.id}
      className="grid grid-cols-6 gap-x-3 gap-y-2 border-b border-hairline py-3 last:border-b-0 md:table-row md:py-0"
    >
      <td role="cell" className="order-1 col-span-4 min-w-0 md:table-cell md:py-3 md:pr-3 md:align-middle">
        <Link
          href={`/admin/games/${game.id}`}
          className="block truncate text-body font-semibold text-white no-underline hover:text-volt"
        >
          {game.venue}
        </Link>
        <span className="block text-[12px] text-muted">{formatDate(game.startsAt)}</span>
      </td>
      <td role="cell" className="order-3 col-span-6 md:table-cell md:w-[30%] md:px-3 md:py-3 md:align-middle">
        <SeatBar game={economics} seatsTaken={economics.seatsTaken} testId="money-seat-bar" />
        <span className="mt-[6px] block text-[12px] tabular-nums text-muted">{seatsLabel}</span>
      </td>
      <td role="cell" className={`order-4 ${NUMBER_CELL} text-bone`}>
        <StackLabel>{copy.colRevenue}</StackLabel>
        {formatCzk(economics.revenueCzk)}
      </td>
      <td role="cell" className={`order-5 ${NUMBER_CELL} text-bone`}>
        <StackLabel>{copy.colPitch}</StackLabel>
        {economics.pitchCostCzk === null ? DASH : formatCzk(economics.pitchCostCzk)}
      </td>
      <td
        role="cell"
        data-testid="money-profit"
        className="order-2 col-span-2 self-start text-right font-semibold md:table-cell md:whitespace-nowrap md:px-3 md:py-3 md:align-middle"
      >
        {economics.profitCzk === null ? (
          <span className="text-muted">{DASH}</span>
        ) : (
          <SignedCzk amount={economics.profitCzk} />
        )}
      </td>
      <td role="cell" className={`order-6 ${NUMBER_CELL} text-bone md:pl-3 md:pr-0`}>
        <StackLabel>{copy.colBreakEven}</StackLabel>
        {economics.breakEvenSeats === null ? DASH : countLabel(economics.breakEvenSeats, SEATS)}
      </td>
    </tr>
  );
}

export function ProfitPerGamePanel({
  rows,
  totals,
  seats,
}: {
  rows: ProfitRow[];
  totals: ProfitTotals;
  seats: SeatBarInput;
}) {
  return (
    <Panel title={copy.profitTitle} testId="money-profit-per-game">
      <p className="-mt-1 mb-4 text-small text-muted">{copy.profitLede}</p>

      {rows.length === 0 ? (
        <p className="m-0 text-small text-muted">{copy.profitEmpty}</p>
      ) : (
        <>
          <dl data-testid="money-profit-totals" className="m-0 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Total label={copy.totalRevenue}>{formatCzk(totals.revenueCzk)}</Total>
            <Total label={copy.totalPitch}>{formatCzk(totals.pitchCostCzk)}</Total>
            <Total label={copy.totalProfit}>
              <SignedCzk amount={totals.profitCzk} testId="money-total-profit" />
            </Total>
            <Total label={copy.brokeEven}>
              {copy.brokeEvenValue
                .replace("{n}", String(totals.brokeEven))
                .replace("{total}", String(totals.costedGames))}
            </Total>
          </dl>

          <table role="table" className="mt-4 block w-full border-collapse md:table">
            <thead role="rowgroup" className="hidden border-b border-hairline md:table-header-group">
              <tr role="row">
                <th role="columnheader" scope="col" className={`${TH} pl-0 text-left`}>
                  {copy.colGame}
                </th>
                <th role="columnheader" scope="col" className={`${TH} text-left`}>
                  {copy.colSeats}
                </th>
                <th role="columnheader" scope="col" className={`${TH} text-right`}>
                  {copy.colRevenue}
                </th>
                <th role="columnheader" scope="col" className={`${TH} text-right`}>
                  {copy.colPitch}
                </th>
                <th role="columnheader" scope="col" className={`${TH} text-right`}>
                  {copy.colProfit}
                </th>
                <th role="columnheader" scope="col" className={`${TH} pr-0 text-right`}>
                  {copy.colBreakEven}
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup" className="block md:table-row-group">
              {rows.map((row) => (
                <GameRow key={row.game.id} row={row} />
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap items-end gap-x-4">
            <SeatLegend game={seats} />
            <span className="mt-3 flex items-center gap-[6px] text-[12px] text-muted">
              <span aria-hidden className="h-3 w-[2px] rounded-pill bg-bone" />
              {strings.admin.breakEven}
            </span>
          </div>

          {totals.uncostedGames > 0 && (
            <p className="mb-0 mt-3 text-[12px] text-faint">
              {countLabel(totals.uncostedGames, { one: copy.uncostedOne, many: copy.uncostedMany })}
            </p>
          )}
        </>
      )}
    </Panel>
  );
}
