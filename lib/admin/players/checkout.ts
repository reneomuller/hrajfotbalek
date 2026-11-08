import type { BookingStatus, TopupStatus } from "@/lib/types/database";

/**
 * Who started paying and never finished (round 42, the admin rebuild).
 *
 * TWO WAYS TO START PAYING. A card checkout for a game is a `checkout_sessions`
 * row: `open` while Stripe holds the form, `expired` once it lapsed, `booked`
 * or `credited` once money arrived. A Game Pass purchase is a `credit_topups`
 * row, `pending` until the payment confirms it.
 *
 * "NO LATER SUCCESS" IS THE POINT. A player who abandoned a checkout on Monday
 * and paid for a game on Tuesday does not need chasing, so an attempt is
 * unfinished only if nothing completed after it: no paid checkout, no
 * confirmed purchase, and no booking made — a booking paid in Credit or cash,
 * or seated by an admin, settles it just as well. An `expired` booking is the
 * one that never settled anything: it is a seat that was lost.
 *
 * A `cancelled` purchase is left out altogether: somebody decided that.
 */

export interface CheckoutHistory {
  sessions: { playerId: string; status: "open" | "booked" | "credited" | "expired"; createdAt: string }[];
  topups: { playerId: string; status: TopupStatus; createdAt: string }[];
  bookings: { playerId: string; status: BookingStatus; createdAt: string }[];
}

interface Moment {
  at: number;
  iso: string;
}

/** Keeps the later of what is there and this moment. */
function keepLatest(map: Map<string, Moment>, playerId: string, iso: string): void {
  const at = Date.parse(iso);
  const current = map.get(playerId);
  if (current === undefined || at > current.at) map.set(playerId, { at, iso });
}

/** Per player, when their most recent unfinished attempt started (as stored). */
export function unfinishedCheckouts(history: CheckoutHistory): Map<string, string> {
  const lastUnfinished = new Map<string, Moment>();
  const lastCompleted = new Map<string, Moment>();

  for (const session of history.sessions) {
    const unfinished = session.status === "open" || session.status === "expired";
    keepLatest(unfinished ? lastUnfinished : lastCompleted, session.playerId, session.createdAt);
  }
  for (const topup of history.topups) {
    if (topup.status === "cancelled") continue;
    keepLatest(topup.status === "pending" ? lastUnfinished : lastCompleted, topup.playerId, topup.createdAt);
  }
  for (const booking of history.bookings) {
    if (booking.status !== "expired") keepLatest(lastCompleted, booking.playerId, booking.createdAt);
  }

  const result = new Map<string, string>();
  for (const [playerId, attempt] of lastUnfinished) {
    const completed = lastCompleted.get(playerId);
    if (completed === undefined || completed.at < attempt.at) result.set(playerId, attempt.iso);
  }
  return result;
}
