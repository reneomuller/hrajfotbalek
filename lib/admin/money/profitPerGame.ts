import type { GameEconomics } from "@/lib/admin/economics";
import type { SeatBarInput } from "@/lib/admin/seatBar";

/**
 * Profit per game, laid out and totalled (round 42, the admin rebuild).
 *
 * The owner: "I do want the profit and break-even per game". `game_economics`
 * values the seats and subtracts the pitch; this keeps the games in the order
 * they were read, and totals them.
 *
 * A GAME WITH NO PITCH COST IS LEFT OUT OF PROFIT, not counted as free. It has
 * no venue, so SQL answers null for its cost, its profit and its break-even —
 * and adding its revenue to the profit total would print a margin on a pitch
 * nobody priced. Its revenue still counts, and the page says how many games
 * were left out.
 */
export interface PlayedGame {
  id: string;
  startsAt: string;
  venue: string;
}

export interface ProfitRow {
  game: PlayedGame;
  economics: GameEconomics;
}

export interface ProfitTotals {
  revenueCzk: number;
  /** Over games with a pitch cost. */
  pitchCostCzk: number;
  /** Over games with a pitch cost. */
  profitCzk: number;
  costedGames: number;
  /** Games with a cost whose profit is zero or more. */
  brokeEven: number;
  uncostedGames: number;
}

export function profitTable(
  games: readonly PlayedGame[],
  byGame: ReadonlyMap<string, GameEconomics>,
): { rows: ProfitRow[]; totals: ProfitTotals } {
  const rows = games.flatMap((game) => {
    const economics = byGame.get(game.id);
    return economics ? [{ game, economics }] : [];
  });

  const totals: ProfitTotals = {
    revenueCzk: 0,
    pitchCostCzk: 0,
    profitCzk: 0,
    costedGames: 0,
    brokeEven: 0,
    uncostedGames: 0,
  };

  for (const { economics } of rows) {
    totals.revenueCzk += economics.revenueCzk;
    if (economics.pitchCostCzk === null || economics.profitCzk === null) {
      totals.uncostedGames += 1;
      continue;
    }
    totals.costedGames += 1;
    totals.pitchCostCzk += economics.pitchCostCzk;
    totals.profitCzk += economics.profitCzk;
    if (economics.profitCzk >= 0) totals.brokeEven += 1;
  }

  return { rows, totals };
}

/**
 * Every row's seats by kind, for the one legend under the table. No
 * break-even: each game has its own, and a sum of them is not a line on
 * anybody's pitch.
 */
export function seatTotals(rows: readonly ProfitRow[]): SeatBarInput {
  const totals: SeatBarInput = {
    capacity: 0,
    singleSeats: 0,
    passSeats: 0,
    creditSeats: 0,
    freeSeats: 0,
    houseGuests: 0,
    unpaidSeats: 0,
    breakEvenSeats: null,
  };
  for (const { economics } of rows) {
    totals.capacity += economics.capacity;
    totals.singleSeats += economics.singleSeats;
    totals.passSeats += economics.passSeats;
    totals.creditSeats += economics.creditSeats;
    totals.freeSeats += economics.freeSeats;
    totals.houseGuests += economics.houseGuests;
    totals.unpaidSeats += economics.unpaidSeats;
  }
  return totals;
}
