import type { GameEconomics } from "@/lib/admin/economics";
import type { SeatBarInput } from "@/lib/admin/seatBar";

/**
 * A dashboard row's seat bar (round 42, the admin rebuild).
 *
 * TWO SHAPES, ONE BAR. Until the owner applies the pitch-cost migration there
 * is no split by how each seat was paid and no pitch cost to break even
 * against, so the bar is one fill of the booked seats — the same number the
 * row prints. Once `game_economics` exists, the bar is the games list's: the
 * split, and the line at break-even.
 */
export type RowEconomics = Pick<
  GameEconomics,
  | "singleSeats"
  | "passSeats"
  | "creditSeats"
  | "freeSeats"
  | "houseGuests"
  | "unpaidSeats"
  | "breakEvenSeats"
  | "priceCzk"
  | "profitCzk"
>;

export interface RowSeats {
  capacity: number;
  /** Seats taken, from the one counter — `countSeatsTaken`. */
  booked: number;
  economics: RowEconomics | null;
}

export function rowSeatBarInput(row: RowSeats): SeatBarInput {
  if (!row.economics) {
    return {
      capacity: row.capacity,
      singleSeats: row.booked,
      passSeats: 0,
      creditSeats: 0,
      freeSeats: 0,
      houseGuests: 0,
      unpaidSeats: 0,
      breakEvenSeats: null,
    };
  }
  const { singleSeats, passSeats, creditSeats, freeSeats, houseGuests, unpaidSeats, breakEvenSeats, profitCzk } =
    row.economics;
  return {
    capacity: row.capacity,
    singleSeats,
    passSeats,
    creditSeats,
    freeSeats,
    houseGuests,
    unpaidSeats,
    breakEvenSeats,
    profitCzk,
  };
}

export type BreakEvenNote = { kind: "past" } | { kind: "short"; seats: number };

/**
 * How far a game is from paying for its pitch, or null when that cannot be
 * said. COUNTED IN MONEY, at the game's price — the games list's rule
 * (`lib/admin/games/breakEven.ts`): a pass seat is worth less than a single
 * game, so seats that reach the line can still leave the pitch unpaid.
 */
export function breakEvenNote(row: RowSeats): BreakEvenNote | null {
  const economics = row.economics;
  if (!economics || economics.breakEvenSeats === null || economics.profitCzk === null) return null;
  if (economics.priceCzk <= 0) return null;

  const down = -Math.round(economics.profitCzk);
  if (down <= 0) return { kind: "past" };
  return { kind: "short", seats: Math.ceil(down / economics.priceCzk) };
}
