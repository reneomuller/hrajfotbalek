/**
 * The seat bar on every game row and game page (round 42, the admin rebuild).
 *
 * How full the pitch is, split by how each seat was paid, and a line at the
 * seat where the game stops losing money — the friend's mock's best idea, kept
 * in this product's colours. Pure, so the list and the game page draw the same
 * bar from the same numbers.
 *
 * THE ORDER IS THE MONEY'S ORDER: seats that brought the full price first, then
 * the cheaper pass seats, then balance Credits, then the seats that brought
 * nothing (gifts, seed bookings, house guests), then the ones still owing.
 * Read left to right, the bar is "what this game earned, then what it is
 * carrying".
 */
export type SeatKind = "single" | "pass" | "credit" | "free" | "house" | "unpaid";

export interface SeatBarInput {
  capacity: number;
  singleSeats: number;
  passSeats: number;
  creditSeats: number;
  freeSeats: number;
  houseGuests: number;
  unpaidSeats: number;
  breakEvenSeats: number | null;
}

export interface SeatBar {
  segments: { kind: SeatKind; seats: number; percent: number }[];
  /** Where the break-even line sits, 0–100; null when the game has no pitch cost. */
  breakEvenPercent: number | null;
  /** Whether the seats that brought money have reached break-even. */
  pastBreakEven: boolean;
}

const FULL = 100;

function share(seats: number, capacity: number): number {
  return Math.round((seats / capacity) * FULL * 100) / 100;
}

export function seatBar(game: SeatBarInput): SeatBar {
  const paidSeats = game.singleSeats + game.passSeats + game.creditSeats;
  const pastBreakEven = game.breakEvenSeats !== null && paidSeats >= game.breakEvenSeats;

  if (game.capacity <= 0) {
    return { segments: [], breakEvenPercent: null, pastBreakEven };
  }

  const ordered: [SeatKind, number][] = [
    ["single", game.singleSeats],
    ["pass", game.passSeats],
    ["credit", game.creditSeats],
    ["free", game.freeSeats],
    ["house", game.houseGuests],
    ["unpaid", game.unpaidSeats],
  ];

  let room = game.capacity;
  const segments: SeatBar["segments"] = [];
  for (const [kind, seats] of ordered) {
    const drawn = Math.min(seats, room);
    if (drawn <= 0) continue;
    room -= drawn;
    segments.push({ kind, seats, percent: share(drawn, game.capacity) });
  }

  const breakEvenPercent =
    game.breakEvenSeats === null ? null : Math.min(share(game.breakEvenSeats, game.capacity), FULL);

  return { segments, breakEvenPercent, pastBreakEven };
}

/**
 * A seat count as people say it. Seats are whole except where a player's
 * Credit pool mixed paid and gifted money, which values half a seat as paid —
 * so one decimal at most, and none when there is nothing after the point.
 */
export function formatSeats(seats: number): string {
  const rounded = Math.round(seats * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
