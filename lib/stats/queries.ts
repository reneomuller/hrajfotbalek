import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";
import { statRange, type StatRange, type StatWindow } from "@/lib/stats/window";

/**
 * The admin metrics, every one of them bounded by a date window.
 *
 * REWRITTEN IN PHASE 19, not edited (F7). Not a single query in the previous
 * version had a date bound — every number was "since the beginning of time",
 * which is a figure that can only go up and therefore says nothing about
 * whether anything is working. Adding a window to each of them meant changing
 * what each one counts and where it counts it from, which is a rewrite however
 * it is spelled.
 *
 * WHAT WENT (REQ-ADMIN-004), and why each removal is a decision:
 *   - CREDITS OUTSTANDING. A balance-sheet number on an operations page. It is
 *     still one query away and belongs on the day there is a balance sheet.
 *   - MAGIC-LINK DROP-OFF. Passwords are the front door now; the link path is
 *     recovery. A funnel metric for a recovery path measures how often people
 *     forget things.
 *   - WAITLIST DEPTH. v2.5 called it "the expansion-trigger sensor"; §7
 *     supersedes that with the observation that a number nobody looked at is
 *     not a sensor. NOTHING ABOUT THE DATA CHANGES — `waitlist` is intact and
 *     the depth is one query away the day it is wanted again. Only the panel
 *     goes.
 *
 * WHAT STAYED AND WHAT ARRIVED (REQ-ADMIN-005): no-show rate, fill rate,
 * confirmed revenue, new vs returning, cancellations — each matching the SQL
 * definition in `PHASE2_IMPLEMENTATION.md` §B.4, restated above each function
 * so the two cannot drift.
 *
 * NO NEW TRACKING MACHINERY (REQ-ADMIN-007). Every number is an aggregate over
 * `events` and the existing tables. That was the whole bet of the Phase 1
 * event log, and this is the second time it has paid.
 *
 * READS ONLY, through the service-role client: `events` has no client grant at
 * all and `bookings`/`credit_ledger` are own-row for players, so an admin
 * session reading these directly would see almost nothing.
 */

export interface NoShowStats {
  marked: number;
  noShows: number;
}

export interface FillRateStats {
  /** Active bookings on games in range. */
  sold: number;
  /** Total capacity of those games. */
  capacity: number;
}

export interface NewReturningStats {
  newPlayers: number;
  returning: number;
}

export interface CancellationStats {
  total: number;
  /** Those that issued credit — i.e. money had already been applied. */
  withCredit: number;
}

export interface AdminStats {
  range: StatRange;
  noShow: NoShowStats;
  fillRate: FillRateStats;
  confirmedRevenueCzk: number;
  newReturning: NewReturningStats;
  cancellations: CancellationStats;
}

/**
 * No-show rate.
 *
 *   count(bookings where attendance='no_show')
 *     / count(bookings where attendance is not null)
 *   over games whose starts_at falls in range
 *
 * Over MARKED bookings, not all bookings: an unmarked booking is an unanswered
 * question, and folding it into the denominator would drag the rate toward
 * zero every time an organizer forgot to mark a game.
 */
async function getNoShowRate(range: StatRange): Promise<NoShowStats> {
  const service = createServiceRoleSupabaseClient();
  const gameIds = await gamesInRange(range);
  if (gameIds.length === 0) return { marked: 0, noShows: 0 };

  const { data } = await service
    .from("bookings")
    .select("attendance")
    .in("game_id", gameIds)
    .not("attendance", "is", null);

  const rows = data ?? [];
  return {
    marked: rows.length,
    noShows: rows.filter((row) => row.attendance === "no_show").length,
  };
}

/**
 * Fill rate.
 *
 *   sum(active bookings) / sum(capacity)
 *   over games with starts_at in range
 *
 * Active = `confirmed` + `reserved`, which is the same definition
 * `create_booking`'s capacity check uses. Counting only `confirmed` would make
 * a game full of unpaid holds look empty, and counting cancelled bookings
 * would let one indecisive player fill a pitch.
 */
async function getFillRate(range: StatRange): Promise<FillRateStats> {
  const service = createServiceRoleSupabaseClient();

  const { data: games } = await service
    .from("games")
    .select("id, capacity")
    .gte("starts_at", range.from)
    .lt("starts_at", range.to)
    .in("status", ["published", "full", "played", "settled"]);

  if (!games || games.length === 0) return { sold: 0, capacity: 0 };

  const { data: bookings } = await service
    .from("bookings")
    .select("id")
    .in(
      "game_id",
      games.map((g) => g.id),
    )
    .in("status", ["reserved", "confirmed"]);

  return {
    sold: (bookings ?? []).length,
    capacity: games.reduce((total, game) => total + game.capacity, 0),
  };
}

/**
 * Confirmed revenue, in CZK.
 *
 *   sum(price_czk - credit_applied_czk)
 *   over bookings with a payment_confirmed event in range
 *
 * CREDIT APPLIED IS EXPLICITLY EXCLUDED, and that is the whole point of the
 * metric. Credit is not money arriving — it is a liability being discharged,
 * and the money behind it arrived when the top-up was confirmed or was never
 * money at all when it came from a cancellation. Counting it here would book
 * the same crown twice.
 */
async function getConfirmedRevenue(range: StatRange): Promise<number> {
  const service = createServiceRoleSupabaseClient();

  const { data: events } = await service
    .from("events")
    .select("booking_id")
    .eq("event_type", "payment_confirmed")
    .gte("created_at", range.from)
    .lt("created_at", range.to)
    .not("booking_id", "is", null);

  const bookingIds = [...new Set((events ?? []).map((row) => row.booking_id))].filter(
    (id): id is string => id !== null,
  );
  if (bookingIds.length === 0) return 0;

  const { data: bookings } = await service
    .from("bookings")
    .select("price_czk, credit_applied_czk")
    .in("id", bookingIds);

  return (bookings ?? []).reduce(
    (total, row) => total + Math.max(0, row.price_czk - row.credit_applied_czk),
    0,
  );
}

/**
 * New vs returning.
 *
 *   a booking is NEW if it is that player's first booking_created ever;
 *   RETURNING otherwise. Computed over booking_created events in range.
 *
 * "EVER" IS LOAD-BEARING and is why this reads the whole event history for the
 * players who booked in range rather than only the window. A player's second
 * booking is a returning booking even if their first was last year — deciding
 * it from inside the window would count every player as new on the first day
 * of every month.
 */
async function getNewReturning(range: StatRange): Promise<NewReturningStats> {
  const service = createServiceRoleSupabaseClient();

  const { data: inRange } = await service
    .from("events")
    .select("player_id, created_at")
    .eq("event_type", "booking_created")
    .gte("created_at", range.from)
    .lt("created_at", range.to)
    .not("player_id", "is", null);

  const rows = (inRange ?? []).filter(
    (row): row is { player_id: string; created_at: string } => row.player_id !== null,
  );
  if (rows.length === 0) return { newPlayers: 0, returning: 0 };

  const playerIds = [...new Set(rows.map((row) => row.player_id))];

  // The first `booking_created` each of those players ever wrote.
  const { data: history } = await service
    .from("events")
    .select("player_id, created_at")
    .eq("event_type", "booking_created")
    .in("player_id", playerIds);

  const firstEver = new Map<string, string>();
  for (const row of history ?? []) {
    if (!row.player_id) continue;
    const seen = firstEver.get(row.player_id);
    if (!seen || row.created_at < seen) firstEver.set(row.player_id, row.created_at);
  }

  let newPlayers = 0;
  for (const row of rows) {
    if (firstEver.get(row.player_id) === row.created_at) newPlayers += 1;
  }

  return { newPlayers, returning: rows.length - newPlayers };
}

/**
 * Cancellations.
 *
 *   count(booking_cancelled events in range),
 *   split by whether a credit_issued accompanied it
 *
 * The split matters operationally: a cancellation that issued credit is one
 * where money had already been applied and is now owed back in football. One
 * that issued none was an unpaid hold quietly released, which costs nothing
 * and is the system working.
 */
async function getCancellations(range: StatRange): Promise<CancellationStats> {
  const service = createServiceRoleSupabaseClient();

  const { data: cancelled } = await service
    .from("events")
    .select("booking_id")
    .eq("event_type", "booking_cancelled")
    .gte("created_at", range.from)
    .lt("created_at", range.to);

  const rows = cancelled ?? [];
  const bookingIds = rows
    .map((row) => row.booking_id)
    .filter((id): id is string => id !== null);

  if (bookingIds.length === 0) return { total: rows.length, withCredit: 0 };

  const { data: credited } = await service
    .from("events")
    .select("booking_id")
    .eq("event_type", "credit_issued")
    .in("booking_id", bookingIds);

  const creditedIds = new Set((credited ?? []).map((row) => row.booking_id));

  return {
    total: rows.length,
    withCredit: bookingIds.filter((id) => creditedIds.has(id)).length,
  };
}

/** Ids of games whose kick-off falls in range and that were publicly on. */
async function gamesInRange(range: StatRange): Promise<string[]> {
  const service = createServiceRoleSupabaseClient();
  const { data } = await service
    .from("games")
    .select("id")
    .gte("starts_at", range.from)
    .lt("starts_at", range.to)
    .in("status", ["published", "full", "played", "settled"]);

  return (data ?? []).map((row) => row.id);
}

/**
 * Everything the stats page renders, in one round of parallel reads.
 *
 * TAKES A WINDOW AND READS THE CLOCK ITSELF, returning the range it used. The
 * page cannot read the clock — that is impure during render, and the lint rule
 * saying so is enforcing a real property — and it needs the exact bounds the
 * numbers were computed against in order to print them. Handing back the range
 * is what keeps the label and the figures describing the same period.
 */
export async function getAdminStats(window: StatWindow): Promise<AdminStats> {
  const range = statRange(window, Date.now());
  return getAdminStatsForRange(range);
}

/** The bounded form, kept separate so the range can be supplied in a test. */
export async function getAdminStatsForRange(range: StatRange): Promise<AdminStats> {
  const [noShow, fillRate, confirmedRevenueCzk, newReturning, cancellations] =
    await Promise.all([
      getNoShowRate(range),
      getFillRate(range),
      getConfirmedRevenue(range),
      getNewReturning(range),
      getCancellations(range),
    ]);

  return { range, noShow, fillRate, confirmedRevenueCzk, newReturning, cancellations };
}

/**
 * `n / total` as a whole-percent string, or a dash when there is nothing yet.
 *
 * A dash rather than 0%: with no data the honest answer is "no answer", and a
 * 0% fill rate on a week with no games reads as a problem when it is really an
 * empty window. That reading matters more since Phase 19, because a window CAN
 * legitimately be empty — "today" usually is.
 */
export function ratio(n: number, total: number): string {
  if (total <= 0) return "—";
  return `${Math.round((n / total) * 100)}%`;
}
