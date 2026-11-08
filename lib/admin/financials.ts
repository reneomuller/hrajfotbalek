import { bucketByWeek, pragueMonth, type WeekBar } from "@/lib/admin/money/periods";
import { playedGamesBetween } from "@/lib/admin/money/playedGames";
import { chunk } from "@/lib/admin/money/readAll";
import { revenueBetween, type RevenueSplit } from "@/lib/admin/money/revenue";
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
  /** Everything that arrived — games, Game Passes, top-ups (2026-11-08). */
  revenueCzk: number;
  /** The same money, by what it paid for. */
  revenueSplit: RevenueSplit;
  /**
   * The comparable figure for the period before this one, for the frame's
   * "+12% vs July".
   *
   * NULL FOR ALL TIME, and that is the honest answer rather than a missing
   * feature: there is no period before all of them. The page renders no delta
   * when this is null instead of printing a zero that reads as "flat".
   */
  previousRevenueCzk: number | null;
  /**
   * Games that KICKED OFF in the period, cancelled ones aside — not
   * `status = settled`, which the nightly sweep reaches the next morning
   * (`lib/admin/money/playedGames.ts`).
   */
  gamesPlayed: number;
  /**
   * Each played game's OWN revenue (`game_economics`, pass seats at what the
   * pass cost), averaged — or null when there is none to average or the
   * economics are not there to read. ~~Revenue divided by settled games~~ —
   * that divided money paid UP FRONT for games still ahead by the games
   * already finished.
   */
  avgPerGameCzk: number | null;
  weeks: WeekBar[];
  /*
   * ~~outstandingCzk / unpaidSpots~~ — removed 2026-11-08, the owner: "it is
   * redundant. everyone pays up front." Unpaid seats still show on each
   * game's page.
   */
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
/** Each played game's own revenue, averaged; null when it cannot be read. */
async function averagePerPlayedGame(gameIds: readonly string[]): Promise<number | null> {
  if (gameIds.length === 0) return null;
  const service = createServiceRoleSupabaseClient();
  let total = 0;
  for (const ids of chunk(gameIds)) {
    const { data, error } = await service.rpc("game_economics", { p_game_ids: ids });
    if (error) throw new Error(`game_economics failed: ${error.message}`, { cause: error });
    for (const row of data ?? []) total += Number(row.revenue_czk);
  }
  return Math.round(total / gameIds.length);
}

function weeklyRevenue(bounds: PeriodBounds, entries: readonly { at: string; czk: number }[]): WeekBar[] {
  if (!bounds.from || !bounds.to) return [];
  return bucketByWeek(entries, { from: bounds.from, to: bounds.to });
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
export interface FinancialsOptions {
  /** Whether `game_economics` exists (`app_capabilities().pitchCosts`). */
  economics?: boolean;
}

export async function getFinancials(period: FinancialPeriod, options: FinancialsOptions = {}): Promise<Financials> {
  return getFinancialsAt(period, Date.now(), options);
}

/** The bounded form, kept separate so a test can supply the instant. */
export async function getFinancialsAt(
  period: FinancialPeriod,
  now: Date | number | string,
  options: FinancialsOptions = {},
): Promise<Financials> {
  const bounds = financialBounds(period, now);
  const prev = previousBounds(period, now);

  /*
   * Money that arrived comes from `revenueBetween` — games, Game Passes and
   * top-ups (2026-11-08) — the one reading behind this page's Revenue, its
   * split, its week chart, Operations' confirmed revenue and the dashboard's
   * month. The week chart is cut from the SAME entries, so its bars always add
   * up to the Revenue tile.
   */
  const nowMs = new Date(now).getTime();
  const [revenue, previous, played, transactions] = await Promise.all([
    revenueBetween(bounds),
    prev ? revenueBetween(prev) : Promise.resolve(null),
    playedGamesBetween(bounds, nowMs),
    recentTransactions(8),
  ]);

  const avgPerGameCzk = options.economics ? await averagePerPlayedGame(played.map((game) => game.id)) : null;

  return {
    period,
    bounds,
    revenueCzk: revenue.totalCzk,
    revenueSplit: { gamesCzk: revenue.gamesCzk, passCzk: revenue.passCzk, topupCzk: revenue.topupCzk },
    previousRevenueCzk: previous === null ? null : previous.totalCzk,
    gamesPlayed: played.length,
    avgPerGameCzk,
    weeks: weeklyRevenue(bounds, revenue.entries),
    transactions,
  };
}
