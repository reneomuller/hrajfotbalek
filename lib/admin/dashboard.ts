import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";
import { countSeatsTaken } from "@/lib/admin/queries";
import { getGameEconomics } from "@/lib/admin/economics";
import { COUNTED_PLAYER_FILTER } from "@/lib/admin/playerScope";
import type { RowEconomics } from "@/lib/admin/shell/dashboardRows";
import type { DashboardWindow } from "@/lib/admin/shell/dashboardView";
import { appCapabilities } from "@/lib/db/capabilities";
import { statRange } from "@/lib/stats/window";

/**
 * The admin dashboard's four figures and its upcoming rows (round 8, item 2).
 *
 * `p14` IS A COMPOSITION, NOT A NEW SOURCE. Item 0 established that every
 * element on that frame already exists somewhere live: the tiles are the
 * numbers `/admin/stats` computes, the rows are `/admin/games`, the quick
 * actions all have working destinations. This module reads them into one
 * shape so the landing page does not have to know four other pages' queries.
 *
 * SERVICE ROLE, READS ONLY. Cross-player aggregates that RLS correctly hides
 * from any single session; the page above runs inside the admin layout's gate.
 */

export interface DashboardGameRow {
  id: string;
  venue: string;
  startsAt: string;
  capacity: number;
  booked: number;
  status: string;
  organizer: string | null;
  /**
   * `5v5`, `7v7` … NULLABLE, and p14 draws it in every row. Optional in the
   * database since migration 26, so the row renders without it rather than
   * printing an empty separator (round 10, item 1).
   */
  format: string | null;
  /**
   * How the seats were paid and where break-even sits (round 42). NULL until
   * `app_capabilities()` says `pitchCosts` — before the migration the SQL does
   * not exist and the row's bar is a plain fill.
   */
  economics: RowEconomics | null;
}

/** An account, newest first — round 41's "when someone creates an account". */
export interface DashboardSignup {
  id: string;
  nickname: string;
  createdAt: string;
  playerNumber: number | null;
}

export interface AdminDashboard {
  upcomingGames: number;
  /** Seats taken and offered over EVERY upcoming game, not only the listed six. */
  upcomingSeats: { taken: number; capacity: number };
  totalPlayers: number;
  newPlayers7d: number;
  revenueMonthCzk: number;
  /** The bounds the figures above were computed against, for their labels. */
  window: DashboardWindow;
  rows: DashboardGameRow[];
  recentSignups: DashboardSignup[];
}

/** How many sign-ups the dashboard lists. */
export const RECENT_SIGNUPS = 8;

/**
 * SIX ROWS, which is what `p14` draws. Not a page size — a dashboard is a
 * glance, and "the next six" is the glance. The chip row above it is how you
 * get to all of them.
 */
export const DASHBOARD_GAME_ROWS = 6;

const WEEK_MS = 7 * 86_400_000;

/** Confirmed revenue in a period — the same definition the financials page uses. */
async function revenueBetween(from: string, to: string): Promise<number> {
  const service = createServiceRoleSupabaseClient();

  const { data: rows } = await service
    .from("events")
    .select("booking_id")
    .eq("event_type", "payment_confirmed")
    .not("booking_id", "is", null)
    .gte("created_at", from)
    .lt("created_at", to);

  const ids = [...new Set((rows ?? []).map((r) => r.booking_id))].filter(
    (id): id is string => id !== null,
  );
  if (ids.length === 0) return 0;

  const { data: bookings } = await service
    .from("bookings")
    .select("price_czk,credit_applied_czk")
    .in("id", ids);

  /*
   * `credit_applied_czk` IS SUBTRACTED: a booking paid from Credits moved no
   * new money — the cash came in earlier, when the Credits were bought.
   */
  return (bookings ?? []).reduce(
    (sum, r) => sum + Math.max(0, r.price_czk - r.credit_applied_czk),
    0,
  );
}

export async function getAdminDashboard({
  now = Date.now(),
}: { now?: number } = {}): Promise<AdminDashboard> {
  const service = createServiceRoleSupabaseClient();
  const nowIso = new Date(now).toISOString();
  const weekFrom = new Date(now - WEEK_MS).toISOString();

  /*
   * THE REVENUE MONTH IS PRAGUE'S (round 42). It was a UTC month, borrowed
   * from the financials page, so a payment confirmed at 00:30 on the 1st in
   * Prague — 23:30Z the night before — counted towards the month that had
   * just ended. The stats window already does Prague calendar months, DST
   * and all; this asks it rather than doing the arithmetic a second time.
   */
  const month = statRange("month", now);

  /*
   * PLAYERS ARE `lib/admin/playerScope.ts`'S PLAYERS (round 42, the owner:
   * "don't count shadow accounts that we regularly use for booking games and
   * other stuff"). Round 41 already left out shadows and deleted accounts; the
   * seed fixtures still counted, so this tile and the players page disagreed.
   * ONE definition, and the filter is that file's own.
   */
  const countedPlayers = () =>
    service
      .from("players")
      .select("id", { count: "exact", head: true })
      .not(COUNTED_PLAYER_FILTER.notNull, "is", null)
      .is(COUNTED_PLAYER_FILTER.isNull, null)
      .eq(COUNTED_PLAYER_FILTER.isFalse, false);

  const [capabilities, upcoming, players, recent, revenue, signups] = await Promise.all([
    appCapabilities(),
    /*
     * EVERY UPCOMING GAME, NOT A COUNT (round 42). The tile says how full the
     * board is, and that needs each game's seats — one batched counter call
     * over a list that is a few weeks of fixtures long.
     */
    service
      .from("games")
      .select("id,venue,starts_at,capacity,status,format")
      .gt("starts_at", nowIso)
      .in("status", ["published", "full"])
      .order("starts_at", { ascending: true }),
    countedPlayers(),
    countedPlayers().gte("created_at", weekFrom),
    revenueBetween(month.from, month.to),
    service
      .from("players")
      .select("*")
      .not(COUNTED_PLAYER_FILTER.notNull, "is", null)
      .is(COUNTED_PLAYER_FILTER.isNull, null)
      .eq(COUNTED_PLAYER_FILTER.isFalse, false)
      .order("created_at", { ascending: false })
      .limit(RECENT_SIGNUPS),
  ]);

  const upcomingGames = upcoming.data ?? [];
  const rowsRaw = upcomingGames.slice(0, DASHBOARD_GAME_ROWS);

  /*
   * Seats, organizers and economics in ONE query each for the whole set, not
   * one per row. Six games would otherwise be a dozen round trips on a page
   * whose entire job is to load fast.
   */
  const ids = rowsRaw.map((g) => g.id);
  const [booked, organizers, economics] = await Promise.all([
    /*
     * SEATS, THROUGH THE ONE COUNTER (round 35, item 5).
     *
     * ~~A `bookings` query of its own, counting rows.~~ That was the third site
     * with the same miss — a party of three read as 1 and the game's own house
     * guests were not rows at all — and replacing it with a private copy of the
     * fix would have been a fourth. `countSeatsTaken` is the games list's, RPC
     * first and seat arithmetic as the bridge, so this page cannot drift from
     * that one again.
     */
    countSeatsTaken(upcomingGames.map((g) => g.id)),
    ids.length
      ? service
          .from("game_organizer_contacts")
          .select("game_id,organizer_name")
          .in("game_id", ids)
      : Promise.resolve({ data: [] as { game_id: string; organizer_name: string }[] }),
    capabilities.pitchCosts ? getGameEconomics(ids) : Promise.resolve(null),
  ]);

  const organizerOf = new Map(
    (organizers.data ?? []).map((o) => [o.game_id, o.organizer_name]),
  );

  return {
    upcomingGames: upcomingGames.length,
    upcomingSeats: {
      taken: upcomingGames.reduce((sum, g) => sum + (booked.get(g.id) ?? 0), 0),
      capacity: upcomingGames.reduce((sum, g) => sum + g.capacity, 0),
    },
    totalPlayers: players.count ?? 0,
    newPlayers7d: recent.count ?? 0,
    revenueMonthCzk: revenue,
    window: { weekFrom, monthFrom: month.from, monthTo: month.to },
    recentSignups: (signups.data ?? []).map((p) => ({
      id: p.id,
      nickname: p.nickname,
      createdAt: p.created_at,
      playerNumber: p.player_number ?? null,
    })),
    rows: rowsRaw.map((g) => ({
      id: g.id,
      venue: g.venue,
      startsAt: g.starts_at,
      capacity: g.capacity,
      booked: booked.get(g.id) ?? 0,
      status: g.status,
      format: g.format,
      organizer: organizerOf.get(g.id) ?? null,
      economics: economics?.get(g.id) ?? null,
    })),
  };
}
