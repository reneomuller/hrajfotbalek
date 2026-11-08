import type { GameEconomics } from "@/lib/admin/economics";

/**
 * How far an upcoming game is from paying for its pitch (round 42, the admin
 * rebuild) — the line under each upcoming row on the games list, and the
 * break-even line on the game page.
 *
 * IN MONEY, NOT IN SEATS. `game_economics.break_even_seats` is the pitch cost
 * over the game's price — where the line on the seat bar sits — but a Game Pass
 * seat brought less than a single one, which is the difference the owner asked
 * to see. So the shortfall is what the game is still down, in whole seats at
 * its price: the number of single bookings that would close the gap.
 *
 * REACHABLE counts the open seats AND the unpaid ones, because an unpaid seat
 * is a booking that has not paid yet, not a seat nobody wants.
 */
export type BreakEvenOutlook =
  | { kind: "none" }
  | { kind: "covered" }
  | { kind: "short"; seats: number; reachable: boolean };

export type BreakEvenInput = Pick<
  GameEconomics,
  "priceCzk" | "capacity" | "seatsTaken" | "unpaidSeats" | "pitchCostCzk" | "profitCzk"
>;

export function breakEvenOutlook(game: BreakEvenInput): BreakEvenOutlook {
  if (game.pitchCostCzk === null || game.profitCzk === null || game.priceCzk <= 0) {
    return { kind: "none" };
  }

  // Whole crowns: a pass seat's value carries decimals, and a seat is never
  // asked for over a fraction of one.
  const down = -Math.round(game.profitCzk);
  if (down <= 0) return { kind: "covered" };

  const seats = Math.ceil(down / game.priceCzk);
  const open = Math.max(0, game.capacity - game.seatsTaken);
  const canStillPay = open + Math.ceil(game.unpaidSeats);
  return { kind: "short", seats, reachable: seats <= canStillPay };
}
