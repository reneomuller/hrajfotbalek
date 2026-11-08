import type { SeatBarInput, SeatKind } from "@/lib/admin/seatBar";
import type { BookingSeatValue, BookingStatus, PaymentMethod } from "@/lib/types/database";

/**
 * The seat grid on a game's admin page (round 42, the admin rebuild).
 *
 * One cell per seat on the pitch, coloured by how it was paid and labelled with
 * who holds it — the friend's mock's seat map, in this product's colours. The
 * seat bar says how full and how paid; the grid says WHO, which is what an
 * organizer counting heads at the pitch actually asks.
 *
 * WHOLE SEATS. `booking_seat_values` splits a seat where a player's Credit pool
 * mixed paid and gifted money (half a seat paid, half free); a cell cannot be
 * half a colour, so each booking's seats are rounded to whole ones by the
 * largest share — the totals the seat bar draws stay the precise ones.
 *
 * WITHOUT THE PITCH-COST MIGRATION there are no seat values, and the kind is
 * read off the booking instead: a seed booking is free, a Credit booking is a
 * Credit, an unpaid hold is unpaid, anything else confirmed is a single game.
 * Coarser — a pass Credit reads as a Credit — and never wrong about who.
 */

/** The kinds a booking's seat can be. House guests are the game's, not a booking's. */
export type HeldKind = Exclude<SeatKind, "house">;
export type SeatCellKind = SeatKind | "open";

/** The order the seat bar draws in, so the grid reads as the bar folded up. */
const HELD_ORDER: readonly HeldKind[] = ["single", "pass", "credit", "free", "unpaid"];

export type HeldSeats = Record<HeldKind, number>;

export interface SeatHolder {
  bookingId: string;
  nickname: string;
  /** Whole seats this booking holds, by how each was paid. */
  seats: HeldSeats;
}

/** The roster fields the grid reads. `AdminBookingRow` is wider and fits. */
export interface RosterSeatRow {
  id: string;
  nickname: string;
  status: BookingStatus;
  paymentMethod: PaymentMethod;
  guestCount: number;
}

export interface SeatCell {
  key: string;
  /** 1-based, in the order drawn. */
  number: number;
  kind: SeatCellKind;
  bookingId: string | null;
  nickname: string | null;
  /** Every seat of a party after its first: the friends somebody brought. */
  isGuest: boolean;
}

const EMPTY: HeldSeats = { single: 0, pass: 0, credit: 0, free: 0, unpaid: 0 };

/** A shade under a whole seat still counts as the whole seat. */
const EPSILON = 1e-6;

function total(seats: HeldSeats): number {
  return HELD_ORDER.reduce((sum, kind) => sum + seats[kind], 0);
}

/**
 * Fractional seats rounded to `held` whole ones by the largest remainder; any
 * seat the parts do not account for goes on `fallback`, and the result never
 * holds more than `held`.
 */
export function wholeSeats(parts: HeldSeats, held: number, fallback: HeldKind): HeldSeats {
  const out: HeldSeats = { ...EMPTY };
  for (const kind of HELD_ORDER) out[kind] = Math.floor(Math.max(0, parts[kind]) + EPSILON);

  // Over: more whole seats than the booking holds — trim from the end.
  for (const kind of [...HELD_ORDER].reverse()) {
    const excess = total(out) - held;
    if (excess <= 0) break;
    out[kind] -= Math.min(out[kind], excess);
  }

  // Under: hand the remaining seats to the largest fractions, then the fallback.
  const byShare = [...HELD_ORDER]
    .map((kind) => ({ kind, share: Math.max(0, parts[kind]) - out[kind] }))
    .filter(({ share }) => share > EPSILON)
    .sort((a, b) => b.share - a.share);
  for (const { kind } of byShare) {
    if (total(out) >= held) break;
    out[kind] += 1;
  }
  out[fallback] += Math.max(0, held - total(out));
  return out;
}

/** The kind a booking's seats are when nothing better is known. */
function kindOfBooking(row: RosterSeatRow): HeldKind {
  if (row.status === "reserved") return "unpaid";
  if (row.paymentMethod === "seed_free") return "free";
  if (row.paymentMethod === "credit") return "credit";
  return "single";
}

function isLive(status: BookingStatus): boolean {
  return status === "reserved" || status === "confirmed";
}

/**
 * Who holds which seats, in roster order. `values` is `booking_seat_values`
 * for this game, or null where the database cannot answer it yet.
 */
export function seatHolders(
  roster: readonly RosterSeatRow[],
  values: readonly BookingSeatValue[] | null,
): SeatHolder[] {
  const byBooking = new Map((values ?? []).map((v) => [v.booking_id, v]));

  return roster.filter((row) => isLive(row.status)).map((row) => {
    const held = 1 + row.guestCount;
    const fallback = kindOfBooking(row);
    const valued = byBooking.get(row.id);
    const seats = valued
      ? wholeSeats(
          {
            single: valued.single_seats,
            pass: valued.pass_seats,
            credit: valued.credit_seats,
            free: valued.free_seats,
            unpaid: valued.unpaid_seats,
          },
          held,
          fallback,
        )
      : { ...EMPTY, [fallback]: held };
    return { bookingId: row.id, nickname: row.nickname, seats };
  });
}

/** One cell per seat: taken ones in the seat bar's order, then the open ones. */
export function seatGrid({
  capacity,
  houseGuests,
  holders,
}: {
  capacity: number;
  houseGuests: number;
  holders: readonly SeatHolder[];
}): SeatCell[] {
  const cells: SeatCell[] = [];
  const seen = new Set<string>();
  const push = (cell: Omit<SeatCell, "number" | "key">, key: string) =>
    cells.push({ ...cell, key, number: cells.length + 1 });

  const paidKinds = HELD_ORDER.filter((kind) => kind !== "unpaid");
  const drawHeld = (kind: HeldKind) => {
    for (const holder of holders) {
      for (let i = 0; i < holder.seats[kind]; i += 1) {
        const isGuest = seen.has(holder.bookingId);
        seen.add(holder.bookingId);
        push(
          { kind, bookingId: holder.bookingId, nickname: holder.nickname, isGuest },
          `${holder.bookingId}:${kind}:${i}`,
        );
      }
    }
  };

  for (const kind of paidKinds) drawHeld(kind);
  for (let i = 0; i < houseGuests; i += 1) {
    push({ kind: "house", bookingId: null, nickname: null, isGuest: false }, `house:${i}`);
  }
  drawHeld("unpaid");

  const open = Math.max(0, capacity - cells.length);
  for (let i = 0; i < open; i += 1) {
    push({ kind: "open", bookingId: null, nickname: null, isGuest: false }, `open:${i}`);
  }
  return cells;
}

/**
 * The seat bar's input totalled from the holders — the game page's bar when the
 * database has no economics to give it, so there is no break-even line.
 */
export function seatBarFromHolders({
  capacity,
  houseGuests,
  holders,
}: {
  capacity: number;
  houseGuests: number;
  holders: readonly SeatHolder[];
}): SeatBarInput {
  const sum = (kind: HeldKind) => holders.reduce((n, holder) => n + holder.seats[kind], 0);
  return {
    capacity,
    singleSeats: sum("single"),
    passSeats: sum("pass"),
    creditSeats: sum("credit"),
    freeSeats: sum("free"),
    houseGuests,
    unpaidSeats: sum("unpaid"),
    breakEvenSeats: null,
  };
}
