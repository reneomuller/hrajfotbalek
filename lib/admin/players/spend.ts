import type { BookingSeatValue } from "@/lib/types/database";

/**
 * What one player has paid, valued as the games' economics value it (round
 * 42): `booking_seat_values` decides what each seat was worth — a single game
 * at its price, a Game Pass Credit at the pass price over its games, other
 * Credit at what was paid for it, a gift at nothing — and this only adds up
 * that player's rows. `kept` is what a late cancellation held on to.
 *
 * Each part is rounded to whole crowns and the total is the sum of the rounded
 * parts, so the figures on the page always add up.
 */

export interface PlayerSpend {
  singleCzk: number;
  passCzk: number;
  creditCzk: number;
  keptCzk: number;
  totalCzk: number;
}

export function playerSpend(values: BookingSeatValue[], playerId: string): PlayerSpend {
  const own = values.filter((row) => row.player_id === playerId);
  const sum = (pick: (row: BookingSeatValue) => number) => Math.round(own.reduce((total, row) => total + pick(row), 0));

  const singleCzk = sum((row) => row.single_czk);
  const passCzk = sum((row) => row.pass_czk);
  const creditCzk = sum((row) => row.credit_czk);
  const keptCzk = sum((row) => row.kept_czk);

  return { singleCzk, passCzk, creditCzk, keptCzk, totalCzk: singleCzk + passCzk + creditCzk + keptCzk };
}
