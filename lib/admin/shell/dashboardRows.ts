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
  const { singleSeats, passSeats, creditSeats, freeSeats, houseGuests, unpaidSeats, breakEvenSeats } =
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
  };
}

export type BreakEvenNote = { kind: "past" } | { kind: "short"; seats: number };

/**
 * How far a game is from paying for its pitch, or null when that cannot be
 * said. PAID SEATS ONLY — the same sum `seatBar` draws its line against: a
 * gift, a house guest or a seat still owing brings no money in.
 */
export function breakEvenNote(row: RowSeats): BreakEvenNote | null {
  const economics = row.economics;
  if (!economics || economics.breakEvenSeats === null) return null;

  const paid = economics.singleSeats + economics.passSeats + economics.creditSeats;
  if (paid >= economics.breakEvenSeats) return { kind: "past" };
  return { kind: "short", seats: economics.breakEvenSeats - paid };
}
