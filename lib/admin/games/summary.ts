import type { GameEconomics } from "@/lib/admin/economics";

/**
 * What the tab on screen adds up to (round 42, the admin rebuild) — the tiles
 * above the games list. Seats and the queue always; money only once the pitch
 * costs exist, because before that there is no cost to subtract and a
 * "profit" would be revenue wearing the wrong name.
 */
export interface SummarisableGame {
  id: string;
  activeCount: number;
  capacity: number;
  waitlistCount: number;
  unpaidCount: number;
}

export type SummaryEconomics = Pick<GameEconomics, "revenueCzk" | "pitchCostCzk" | "profitCzk">;

export interface GamesSummary {
  games: number;
  seatsTaken: number;
  capacity: number;
  fillPercent: number;
  waiting: number;
  unpaidBookings: number;
  money: {
    /** Every game the economics cover, with or without a pitch cost. */
    revenueCzk: number;
    pitchCostCzk: number;
    /** Over the games that have a pitch cost — the only ones a profit means anything for. */
    profitCzk: number;
    costedGames: number;
    /** Costed games whose money has reached the pitch cost. */
    coveredGames: number;
  } | null;
}

const PERCENT = 100;

export function summariseGames(
  games: readonly SummarisableGame[],
  economics: ReadonlyMap<string, SummaryEconomics> | null,
): GamesSummary {
  const seatsTaken = games.reduce((sum, g) => sum + g.activeCount, 0);
  const capacity = games.reduce((sum, g) => sum + g.capacity, 0);

  return {
    games: games.length,
    seatsTaken,
    capacity,
    fillPercent: capacity > 0 ? Math.round((seatsTaken / capacity) * PERCENT) : 0,
    waiting: games.reduce((sum, g) => sum + g.waitlistCount, 0),
    unpaidBookings: games.reduce((sum, g) => sum + g.unpaidCount, 0),
    money: economics ? sumMoney(games, economics) : null,
  };
}

function sumMoney(
  games: readonly SummarisableGame[],
  economics: ReadonlyMap<string, SummaryEconomics>,
): NonNullable<GamesSummary["money"]> {
  let revenue = 0;
  let cost = 0;
  let profit = 0;
  let costedGames = 0;
  let coveredGames = 0;

  for (const game of games) {
    const row = economics.get(game.id);
    if (!row) continue;
    revenue += row.revenueCzk;
    if (row.pitchCostCzk === null || row.profitCzk === null) continue;
    cost += row.pitchCostCzk;
    profit += row.profitCzk;
    costedGames += 1;
    if (Math.round(row.profitCzk) >= 0) coveredGames += 1;
  }

  return {
    revenueCzk: Math.round(revenue),
    pitchCostCzk: Math.round(cost),
    profitCzk: Math.round(profit),
    costedGames,
    coveredGames,
  };
}
