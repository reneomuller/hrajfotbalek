import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";

/**
 * The Financials page's numbers (round 7, item 8) — `p19`.
 *
 * `p19` IS `/admin/stats` REDESIGNED, not a new surface. The audit filed it as
 * a new page and item 0 corrected that: revenue, games settled and average per
 * game are the same three questions the stats page already answers. What the
 * frame adds is a money-first arrangement, a period switcher, a weekly shape
 * and an outstanding figure.
 *
 * EVERY NUMBER HERE IS READ, NONE IS INVENTED. The frame shows a
 * month-over-month delta, a four-bar week chart and a transaction list; each
 * one below is computed from `bookings`, `credit_ledger` and `games` as they
 * exist today. Where the frame implies a figure this schema cannot produce,
 * the field is absent rather than estimated — see `previousRevenueCzk`.
 *
 * SERVICE ROLE, AND ONLY FOR READS. Every function here is a SELECT. The
 * elevated client is used because these are cross-player aggregates that RLS
 * correctly hides from any single session, and the page above it runs inside
 * the admin layout's gate.
 */

export type FinancialPeriod = "this_month" | "last_month" | "all_time";

export const FINANCIAL_PERIODS: FinancialPeriod[] = [
  "this_month",
  "last_month",
  "all_time",
];

export function isFinancialPeriod(value: unknown): value is FinancialPeriod {
  return (
    value === "this_month" || value === "last_month" || value === "all_time"
  );
}

export interface PeriodBounds {
  /** Inclusive ISO lower bound, or null for all time. */
  from: string | null;
  /** EXCLUSIVE ISO upper bound, or null for all time. */
  to: string | null;
}

export interface WeekBar {
  /** `W1`…`W5` — the frame's own labels. */
  label: string;
  revenueCzk: number;
}

export interface Transaction {
  id: string;
  /** Player nickname, or a dash when the row outlived its player. */
  who: string;
  /** What happened, already resolved to a sentence. */
  what: string;
  /** Positive for money in, negative for money out. */
  amountCzk: number;
  at: string;
}

export interface Financials {
  period: FinancialPeriod;
  bounds: PeriodBounds;
  revenueCzk: number;
  /**
   * The comparable figure for the period before this one, for the frame's
   * "+12% vs July".
   *
   * NULL FOR ALL TIME, and that is the honest answer rather than a missing
   * feature: there is no period before all of them. The page renders no delta
   * when this is null instead of printing a zero that reads as "flat".
   */
  previousRevenueCzk: number | null;
  gamesSettled: number;
  /** Revenue divided by settled games, or null when nothing settled. */
  avgPerGameCzk: number | null;
  weeks: WeekBar[];
  outstandingCzk: number;
  unpaidSpots: number;
  transactions: Transaction[];
}

/**
 * Period bounds from a clock instant.
 *
 * TAKES `now` RATHER THAN READING IT, on the same rule the stats window
 * follows: reading the clock during render is impure, and the page needs the
 * exact bounds the numbers were computed against so its label and its figures
 * describe the same month.
 *
 * Months are UTC. The product's other date arithmetic is Prague-local because
 * it decides which DAY a game belongs to, and being an hour out puts a Sunday
 * evening kick-off on Monday. A revenue month is not that: a booking an hour
 * either side of midnight on the 1st lands in a different month under either
 * rule, and no reader is counting.
 */
export function financialBounds(
  period: FinancialPeriod,
  now: Date | number,
): PeriodBounds {
  if (period === "all_time") return { from: null, to: null };

  const at = new Date(now);
  const year = at.getUTCFullYear();
  const month = at.getUTCMonth();
  const offset = period === "last_month" ? -1 : 0;

  const from = new Date(Date.UTC(year, month + offset, 1));
  const to = new Date(Date.UTC(year, month + offset + 1, 1));
  return { from: from.toISOString(), to: to.toISOString() };
}

/** The period immediately before this one, for the comparison figure. */
function previousBounds(
  period: FinancialPeriod,
  now: Date | number,
): PeriodBounds | null {
  if (period === "all_time") return null;
  const at = new Date(now);
  const shifted = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth() - 1, 15),
  );
  return financialBounds(period, shifted);
}

/**
 * Money actually collected in a period.
 *
 * THROUGH `payment_confirmed` EVENTS, which is how `lib/stats/queries.ts`
 * already computes revenue — and reusing that definition is the point. Two
 * revenue figures on two admin pages that disagree is worse than one page.
 *
 * The event carries WHEN the organizer confirmed the money arrived, so the sum
 * counts what was RECEIVED rather than what was owed. A reserved-but-unpaid
 * spot is not revenue; counting it would make the figure disagree with the
 * bank.
 *
 * `credit_applied_czk` is SUBTRACTED, and this is the subtle one. A booking
 * paid from a wallet moved no new money: the cash came in earlier as a top-up
 * and is counted in the period it arrived. Counting it again here would
 * double-count every pass.
 *
 * There is no `bookings.paid_at` — the first draft of this file assumed one,
 * and the generated types refused it. Left as a note because "surely there is
 * a paid timestamp" is the obvious wrong guess.
 */
async function revenueBetween(bounds: PeriodBounds): Promise<number> {
  const service = createServiceRoleSupabaseClient();

  let events = service
    .from("events")
    .select("booking_id")
    .eq("event_type", "payment_confirmed")
    .not("booking_id", "is", null);

  if (bounds.from) events = events.gte("created_at", bounds.from);
  if (bounds.to) events = events.lt("created_at", bounds.to);

  const { data: rows } = await events;
  const bookingIds = [...new Set((rows ?? []).map((row) => row.booking_id))].filter(
    (id): id is string => id !== null,
  );
  if (bookingIds.length === 0) return 0;

  const { data: bookings } = await service
    .from("bookings")
    .select("price_czk,credit_applied_czk")
    .in("id", bookingIds);

  return (bookings ?? []).reduce(
    (total, row) => total + Math.max(0, row.price_czk - row.credit_applied_czk),
    0,
  );
}

/** Games whose books are closed in the period. */
async function settledBetween(bounds: PeriodBounds): Promise<number> {
  const service = createServiceRoleSupabaseClient();
  let query = service
    .from("games")
    .select("id", { count: "exact", head: true })
    .eq("status", "settled");

  if (bounds.from) query = query.gte("starts_at", bounds.from);
  if (bounds.to) query = query.lt("starts_at", bounds.to);

  const { count } = await query;
  return count ?? 0;
}

/**
 * Money owed right now — NOT scoped to the period, deliberately.
 *
 * "Outstanding" is a question about the present: what is still to collect. A
 * period-scoped version would show 0 while browsing last month and read as
 * "nothing owed" rather than "nothing owed in a window you are not standing
 * in".
 *
 * `reserved` IS THE UNPAID STATE — the same definition `unpaidBookings()` uses
 * on the admin game page, so the two surfaces cannot disagree about who owes.
 * A cancelled game owes nothing; a played-but-unsettled one still does.
 */
async function outstanding(): Promise<{ czk: number; spots: number }> {
  const service = createServiceRoleSupabaseClient();
  const { data } = await service
    .from("bookings")
    .select("price_czk,credit_applied_czk,games!inner(status)")
    .eq("status", "reserved");

  const rows = (data ?? []).filter((row) => {
    const game = row.games as unknown as { status: string } | null;
    return game !== null && game.status !== "cancelled";
  });

  return {
    czk: rows.reduce(
      (sum, row) => sum + Math.max(0, row.price_czk - row.credit_applied_czk),
      0,
    ),
    spots: rows.length,
  };
}

/**
 * The frame's four bars: revenue by week within the period.
 *
 * EMPTY FOR ALL TIME. A bar per week across the product's whole history is a
 * chart nobody can read, and the frame draws four bars labelled W1-W4 — which
 * is a month. The page renders no chart rather than a wrong one.
 *
 * Calendar weeks FROM THE 1st, not ISO weeks: the reader is dividing a month
 * into quarters, not looking up a week number.
 */
async function weeklyRevenue(bounds: PeriodBounds): Promise<WeekBar[]> {
  if (!bounds.from || !bounds.to) return [];

  const service = createServiceRoleSupabaseClient();
  const { data: rows } = await service
    .from("events")
    .select("booking_id,created_at")
    .eq("event_type", "payment_confirmed")
    .not("booking_id", "is", null)
    .gte("created_at", bounds.from)
    .lt("created_at", bounds.to);

  const paidAt = new Map<string, string>();
  for (const row of rows ?? []) {
    if (row.booking_id) paidAt.set(row.booking_id, row.created_at);
  }
  if (paidAt.size === 0) return [];

  const { data: bookings } = await service
    .from("bookings")
    .select("id,price_czk,credit_applied_czk")
    .in("id", [...paidAt.keys()]);

  const start = Date.parse(bounds.from);
  const WEEK = 7 * 86_400_000;
  const buckets = new Map<number, number>();

  for (const row of bookings ?? []) {
    const at = paidAt.get(row.id);
    if (!at) continue;
    const week = Math.min(4, Math.floor((Date.parse(at) - start) / WEEK));
    buckets.set(
      week,
      (buckets.get(week) ?? 0) + Math.max(0, row.price_czk - row.credit_applied_czk),
    );
  }

  const weeks = Math.min(5, Math.ceil((Date.parse(bounds.to) - start) / WEEK));
  return Array.from({ length: weeks }, (_, i) => ({
    label: `W${i + 1}`,
    revenueCzk: buckets.get(i) ?? 0,
  }));
}

/**
 * The most recent movements, from the CREDIT LEDGER.
 *
 * The ledger rather than `bookings`, because the frame's list mixes a game
 * payment, a pass top-up and a refund — three different things that only the
 * ledger holds in one ordered place with a sign on each.
 */
async function recentTransactions(limit: number): Promise<Transaction[]> {
  const service = createServiceRoleSupabaseClient();
  const { data } = await service
    .from("credit_ledger")
    .select("id,delta_czk,reason,created_at,players(nickname)")
    .order("created_at", { ascending: false })
    .limit(limit);

  const REASON: Record<string, string> = {
    cancellation_credit: "Refund — cancelled",
    admin_grant: "Credit granted",
    redemption: "Credit spent on a game",
    adjustment: "Adjustment",
  };

  return (data ?? []).map((row) => {
    const player = row.players as unknown as { nickname: string } | null;
    return {
      id: row.id,
      who: player?.nickname ?? "—",
      what: REASON[row.reason] ?? row.reason,
      amountCzk: row.delta_czk,
      at: row.created_at,
    };
  });
}

/**
 * Everything the page renders, in one round of parallel reads.
 *
 * READS THE CLOCK ITSELF and hands back the bounds it used, exactly as
 * `getAdminStats` does. The page cannot read it: calling `Date.now()` during
 * render is impure, and this codebase has a lint rule that says so and caught
 * the first version of this page. The bounds come back so the label and the
 * figures describe the same month.
 */
export async function getFinancials(period: FinancialPeriod): Promise<Financials> {
  return getFinancialsAt(period, Date.now());
}

/** The bounded form, kept separate so a test can supply the instant. */
export async function getFinancialsAt(
  period: FinancialPeriod,
  now: Date | number,
): Promise<Financials> {
  const bounds = financialBounds(period, now);
  const prev = previousBounds(period, now);

  const [revenueCzk, previousRevenueCzk, gamesSettled, owed, weeks, transactions] =
    await Promise.all([
      revenueBetween(bounds),
      prev ? revenueBetween(prev) : Promise.resolve(null),
      settledBetween(bounds),
      outstanding(),
      weeklyRevenue(bounds),
      recentTransactions(8),
    ]);

  return {
    period,
    bounds,
    revenueCzk,
    previousRevenueCzk,
    gamesSettled,
    // Guarded rather than rendered as a NaN or an Infinity, both of which
    // reach the screen as text.
    avgPerGameCzk: gamesSettled > 0 ? Math.round(revenueCzk / gamesSettled) : null,
    weeks,
    outstandingCzk: owed.czk,
    unpaidSpots: owed.spots,
    transactions,
  };
}
