import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";
import type { EventType } from "@/lib/types/database";

/**
 * The six metric groups, computed as direct aggregates over `events` and the
 * tables.
 *
 * THIS FILE IS THE PLAN'S CENTRAL THESIS, CASHED IN. Because every notable
 * action has written to an append-only event log since Phase 3, every metric
 * here is a query — no analytics service, no event pipeline, no new
 * infrastructure. The cost of that decision was one `insert into events` in
 * each RPC; this is the payoff.
 *
 * Every query below is stated as SQL in its own comment and then expressed
 * through PostgREST. Where a metric needs DISTINCT or a join that PostgREST
 * cannot express directly, the rows are counted in TypeScript over a single
 * indexed column read — noted at each site. All of them hit
 * `(event_type, created_at)` or a table's own primary key.
 *
 * READS ONLY. Nothing in this file writes, and the page that renders it has no
 * action attached. It uses the service-role client because `events` has no
 * client grant at all and `bookings`/`credit_ledger` are own-row for players —
 * an admin session reading these directly would see almost nothing.
 */

export interface FunnelStats {
  signups: number;
  firstBookings: number;
  attended: number;
}

export interface ConversionStats {
  bookingsCreated: number;
  paymentsConfirmed: number;
}

export interface NoShowStats {
  marked: number;
  noShows: number;
}

export interface WaitlistDepthRow {
  gameId: string;
  venue: string;
  startsAt: string;
  waiting: number;
}

export interface DropOffStats {
  linksSent: number;
  completed: number;
}

export interface AdminStats {
  funnel: FunnelStats;
  conversion: ConversionStats;
  noShow: NoShowStats;
  waitlistDepth: WaitlistDepthRow[];
  creditOutstandingCzk: number;
  dropOff: DropOffStats;
}

/** `select count(*) from events where event_type = $1` */
async function countEvents(eventType: EventType): Promise<number> {
  const service = createServiceRoleSupabaseClient();
  const { count } = await service
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", eventType);
  return count ?? 0;
}

/**
 * `select count(distinct player_id) from events where event_type = $1`
 *
 * PostgREST cannot express COUNT(DISTINCT), so the single `player_id` column
 * is read over the index and deduped here. One column, one event type — the
 * shape stays an indexed scan, not a table read.
 */
async function countDistinctPlayers(eventType: EventType): Promise<number> {
  const service = createServiceRoleSupabaseClient();
  const { data } = await service
    .from("events")
    .select("player_id")
    .eq("event_type", eventType)
    .not("player_id", "is", null);

  return new Set((data ?? []).map((row) => row.player_id)).size;
}

/**
 * Signup → first booking → attendance.
 *
 *   signups        select count(*) from events where event_type='account_created'
 *   firstBookings  select count(distinct player_id) from events
 *                    where event_type='booking_created'
 *   attended       select count(*) from bookings where attendance='present'
 *
 * `firstBookings` is DISTINCT players rather than bookings on purpose: the
 * funnel step is "did this person ever book", and counting bookings would let
 * one enthusiastic player look like ten converted signups.
 */
export async function getFunnel(): Promise<FunnelStats> {
  const service = createServiceRoleSupabaseClient();

  const [signups, firstBookings, attended] = await Promise.all([
    countEvents("account_created"),
    countDistinctPlayers("booking_created"),
    service
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("attendance", "present")
      .then(({ count }) => count ?? 0),
  ]);

  return { signups, firstBookings, attended };
}

/**
 * Booking → payment conversion.
 *
 *   select
 *     count(*) filter (where event_type='booking_created')  as bookings_created,
 *     count(*) filter (where event_type='payment_confirmed') as payments_confirmed
 *   from events
 *
 * Counted from EVENTS rather than from `bookings.status` so the denominator
 * keeps bookings that were later cancelled or expired: the question is what
 * share of bookings ever got paid, and dropping the ones that did not would
 * make the answer 100% by construction.
 */
export async function getConversion(): Promise<ConversionStats> {
  const [bookingsCreated, paymentsConfirmed] = await Promise.all([
    countEvents("booking_created"),
    countEvents("payment_confirmed"),
  ]);
  return { bookingsCreated, paymentsConfirmed };
}

/**
 * No-show rate.
 *
 *   select count(*) filter (where attendance is not null) as marked,
 *          count(*) filter (where attendance = 'no_show')  as no_shows
 *   from bookings
 *
 * Over MARKED bookings, not all bookings: an unmarked booking is an unanswered
 * question, and folding it into the denominator would quietly drag the rate
 * toward zero every time an organizer forgot to mark a game.
 */
export async function getNoShowRate(): Promise<NoShowStats> {
  const service = createServiceRoleSupabaseClient();

  const [marked, noShows] = await Promise.all([
    service
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .not("attendance", "is", null)
      .then(({ count }) => count ?? 0),
    service
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("attendance", "no_show")
      .then(({ count }) => count ?? 0),
  ]);

  return { marked, noShows };
}

/**
 * Waitlist depth per upcoming game.
 *
 *   select g.id, g.venue, g.starts_at, count(w.id)
 *     from games g
 *     left join waitlist w
 *       on w.game_id = g.id and w.converted_booking_id is null
 *    where g.starts_at >= now() and g.status in ('published','full')
 *    group by g.id
 *    order by count(w.id) desc
 *
 * THE EXPANSION-TRIGGER SENSOR. When games consistently run a deep waitlist,
 * that is the signal to add a second weekly slot or a second venue — which
 * makes this the most operationally consequential number on the page, and why
 * it is rendered per game rather than as one average that would hide the one
 * game everybody wants.
 */
export async function getWaitlistDepth(): Promise<WaitlistDepthRow[]> {
  const service = createServiceRoleSupabaseClient();

  const { data: games } = await service
    .from("games")
    .select("id, venue, starts_at")
    .in("status", ["published", "full"])
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true });

  if (!games || games.length === 0) return [];

  const { data: waiting } = await service
    .from("waitlist")
    .select("game_id")
    .in(
      "game_id",
      games.map((game) => game.id),
    )
    .is("converted_booking_id", null);

  const depth = new Map<string, number>();
  for (const row of waiting ?? []) {
    depth.set(row.game_id, (depth.get(row.game_id) ?? 0) + 1);
  }

  return games
    .map((game) => ({
      gameId: game.id,
      venue: game.venue,
      startsAt: game.starts_at,
      waiting: depth.get(game.id) ?? 0,
    }))
    .sort((a, b) => b.waiting - a.waiting);
}

/**
 * Credit outstanding across all players.
 *
 *   select coalesce(sum(delta_czk), 0) from credit_ledger
 *
 * This is a LIABILITY, not revenue: it is money already taken that the system
 * still owes in football. It is the one number here that belongs on a balance
 * sheet.
 */
export async function getCreditOutstanding(): Promise<number> {
  const service = createServiceRoleSupabaseClient();
  const { data } = await service.from("credit_ledger").select("delta_czk");
  return (data ?? []).reduce((total, row) => total + row.delta_czk, 0);
}

/**
 * Magic-link drop-off.
 *
 *   select
 *     count(*) filter (where event_type='auth_link_sent')  as links_sent,
 *     count(*) filter (where event_type='auth_completed')  as completed
 *   from events
 *
 * VERIFICATION NOTE. This is the one metric NOT verified against seeded data.
 * The Phase 9 seed deliberately fabricates no auth-funnel events: `events` is
 * append-only with no client access, and a setup-only insert path into it
 * would be a backdoor through the single table whose design exists to forbid
 * exactly that. It is instead verified with ONE REAL SIGNUP at the M4 gate —
 * the figure moves from 0/0 to 1/1. That is a gate criterion, not a fixture
 * assertion.
 */
export async function getDropOff(): Promise<DropOffStats> {
  const [linksSent, completed] = await Promise.all([
    countEvents("auth_link_sent"),
    countEvents("auth_completed"),
  ]);
  return { linksSent, completed };
}

/** Everything the stats page renders, in one round of parallel reads. */
export async function getAdminStats(): Promise<AdminStats> {
  const [funnel, conversion, noShow, waitlistDepth, creditOutstandingCzk, dropOff] =
    await Promise.all([
      getFunnel(),
      getConversion(),
      getNoShowRate(),
      getWaitlistDepth(),
      getCreditOutstanding(),
      getDropOff(),
    ]);

  return { funnel, conversion, noShow, waitlistDepth, creditOutstandingCzk, dropOff };
}

/**
 * `n / total` as a whole-percent string, or a dash when there is nothing yet.
 *
 * A dash rather than 0%: with no data the honest answer is "no answer", and a
 * 0% conversion rate on the first day of a launch reads as a problem when it
 * is really an empty table.
 */
export function ratio(n: number, total: number): string {
  if (total <= 0) return "—";
  return `${Math.round((n / total) * 100)}%`;
}
