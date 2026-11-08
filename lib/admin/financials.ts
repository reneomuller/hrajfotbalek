import { paymentsBetween, totalCzk, type Payment } from "@/lib/admin/money/payments";
import { bucketByWeek, pragueMonth, type WeekBar } from "@/lib/admin/money/periods";
import { readAllPages } from "@/lib/admin/money/readAll";
import { strings } from "@/lib/strings";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";

export type { WeekBar } from "@/lib/admin/money/periods";

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
 * ~~Months are UTC~~ — PRAGUE CALENDAR MONTHS since the round 42 rebuild. The
 * old note said a booking an hour either side of midnight on the 1st "lands
 * in a different month under either rule, and no reader is counting"; the
 * owner is, and a payment at 00:30 on the 1st is that month's money. See
 * `lib/admin/money/periods.ts`. The dashboard's month tile reads this too.
 */
export function financialBounds(
  period: FinancialPeriod,
  now: Date | number | string,
): PeriodBounds {
  if (period === "all_time") return { from: null, to: null };
  return pragueMonth(now, period === "last_month" ? 1 : 0);
}

/** The period immediately before this one, for the comparison figure. */
function previousBounds(
  period: FinancialPeriod,
  now: Date | number | string,
): PeriodBounds | null {
  if (period === "all_time") return null;
  return pragueMonth(now, period === "last_month" ? 2 : 1);
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
  const data = await readAllPages("unpaid bookings", (from, to) =>
    service
      .from("bookings")
      .select("id,price_czk,credit_applied_czk,guest_count,games!inner(status)")
      .eq("status", "reserved")
      .order("id")
      .range(from, to),
  );

  const rows = data.filter((row) => {
    const game = row.games as unknown as { status: string } | null;
    return game !== null && game.status !== "cancelled";
  });

  return {
    czk: rows.reduce(
      (sum, row) => sum + Math.max(0, row.price_czk - row.credit_applied_czk),
      0,
    ),
    /*
     * SPOTS ARE SEATS (round 42, the admin rebuild). ~~`rows.length`~~ called
     * an unpaid party of three "1 unpaid spot" — the row-for-seat bug the fill
     * rate had. The booker plus their guests; the money above is already the
     * party's, because a booking's price is the whole party's.
     */
    spots: rows.reduce((sum, row) => sum + 1 + row.guest_count, 0),
  };
}

/**
 * The frame's bars: revenue by week within the period.
 *
 * EMPTY FOR ALL TIME. A bar per week across the product's whole history is a
 * chart nobody can read, and the frame draws a bar a week — which is a month.
 * The page renders no chart rather than a wrong one.
 *
 * Calendar weeks FROM THE 1st, not ISO weeks: the reader is dividing a month
 * into quarters, not looking up a week number. Bucketed by the PRAGUE day of
 * the month (`bucketByWeek`), not by milliseconds since the 1st, which an
 * hour of clock change was enough to push across a week. The SAME payments
 * as the Revenue figure, so the bars always add up to it.
 */
function weeklyRevenue(bounds: PeriodBounds, payments: readonly Payment[]): WeekBar[] {
  if (!bounds.from || !bounds.to) return [];
  return bucketByWeek(payments, { from: bounds.from, to: bounds.to });
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

  /*
   * THE WORDS LIVE IN `lib/strings.ts`, and all six reasons have one. The
   * table that used to sit here named four, so a pass purchase printed the
   * enum — `topup` — on the one list an admin reads to see money arrive.
   */
  const reasons: Record<string, string> = strings.admin.money.ledgerReason;

  return (data ?? []).map((row) => {
    const player = row.players as unknown as { nickname: string } | null;
    return {
      id: row.id,
      who: player?.nickname ?? "—",
      what: reasons[row.reason] ?? row.reason,
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
  now: Date | number | string,
): Promise<Financials> {
  const bounds = financialBounds(period, now);
  const prev = previousBounds(period, now);

  /*
   * Money actually collected comes from `paymentsBetween` — the one reading
   * behind this page's Revenue, its week chart and Operations' confirmed
   * revenue (round 42; there were three copies). The week chart is cut from
   * the SAME payments, so its bars always add up to the Revenue tile. See
   * `lib/admin/money/payments.ts` for what counts and why credit applied is
   * subtracted.
   */
  const [payments, previousPayments, gamesSettled, owed, transactions] = await Promise.all([
    paymentsBetween(bounds),
    prev ? paymentsBetween(prev) : Promise.resolve(null),
    settledBetween(bounds),
    outstanding(),
    recentTransactions(8),
  ]);

  const revenueCzk = totalCzk(payments);
  const previousRevenueCzk = previousPayments === null ? null : totalCzk(previousPayments);
  const weeks = weeklyRevenue(bounds, payments);

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
