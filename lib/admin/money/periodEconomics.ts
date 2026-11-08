import { getBookingSeatValues, getGameEconomics } from "@/lib/admin/economics";
import type { PeriodBounds } from "@/lib/admin/financials";
import { playedGamesBetween } from "@/lib/admin/money/playedGames";
import { profitTable, seatTotals, type ProfitRow, type ProfitTotals } from "@/lib/admin/money/profitPerGame";
import { revenueMix, type RevenueMix } from "@/lib/admin/money/revenueMix";
import type { SeatBarInput } from "@/lib/admin/seatBar";

/**
 * What the games played in a period earned and cost (round 42, the admin
 * rebuild) — the money page's profit table and its revenue by how it was paid.
 *
 * PLAYED, NOT SCHEDULED: kicked off inside the period, cancelled ones aside —
 * ~~and marked `played` or `settled`~~, which the sweep reaches only the next
 * morning, so the evening's game was missing until then (2026-11-08). The
 * rule is `lib/admin/money/playedGames.ts`, shared with the tiles above.
 *
 * ONLY WHEN `app_capabilities().pitchCosts` SAYS SO — the caller checks. Both
 * functions behind this are created by `20261108100000_pitch_costs.sql`, and
 * PostgREST answers a missing one with a 404.
 *
 * READS ONLY, ON THE SERVICE ROLE, like every admin aggregate.
 */
export interface PeriodEconomics {
  rows: ProfitRow[];
  totals: ProfitTotals;
  mix: RevenueMix;
  /** Every row's seats by kind, for the legend under the table. */
  seats: SeatBarInput;
}

export async function getPeriodEconomics(bounds: PeriodBounds, now: number = Date.now()): Promise<PeriodEconomics> {
  const games = await playedGamesBetween(bounds, now);
  const ids = games.map((game) => game.id);

  const [byGame, values] = await Promise.all([getGameEconomics(ids), getBookingSeatValues(ids)]);

  const { rows, totals } = profitTable(games, byGame);
  return {
    rows,
    totals,
    mix: revenueMix(values, new Map(games.map((game) => [game.id, game.priceCzk]))),
    seats: seatTotals(rows),
  };
}
