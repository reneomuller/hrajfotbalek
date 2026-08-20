import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";
import { financialBounds, type PeriodBounds } from "@/lib/admin/financials";

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
}

export interface AdminDashboard {
  upcomingGames: number;
  totalPlayers: number;
  newPlayers7d: number;
  revenueMonthCzk: number;
  rows: DashboardGameRow[];
}

/** Confirmed revenue in a period — the same definition the financials page uses. */
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
  const ids = [...new Set((rows ?? []).map((r) => r.booking_id))].filter(
    (id): id is string => id !== null,
  );
  if (ids.length === 0) return 0;

  const { data: bookings } = await service
    .from("bookings")
    .select("price_czk,credit_applied_czk")
    .in("id", ids);

  return (bookings ?? []).reduce(
    (sum, r) => sum + Math.max(0, r.price_czk - r.credit_applied_czk),
    0,
  );
}

export async function getAdminDashboard(): Promise<AdminDashboard> {
  const service = createServiceRoleSupabaseClient();
  const nowIso = new Date().toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [upcoming, players, recent, revenue, games] = await Promise.all([
    service
      .from("games")
      .select("id", { count: "exact", head: true })
      .gt("starts_at", nowIso)
      .in("status", ["published", "full"]),
    service.from("players").select("id", { count: "exact", head: true }),
    service
      .from("players")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekAgo),
    revenueBetween(financialBounds("this_month", Date.now())),
    /*
     * SIX ROWS, which is what `p14` draws. Not a page size — a dashboard is a
     * glance, and "the next six" is the glance. The chip row above it is how
     * you get to all of them.
     */
    service
      .from("games")
      .select("id,venue,starts_at,capacity,status,format")
      .gt("starts_at", nowIso)
      .in("status", ["published", "full"])
      .order("starts_at", { ascending: true })
      .limit(6),
  ]);

  const rowsRaw = games.data ?? [];

  /*
   * Booked counts and organizers in TWO queries for the whole set, not one
   * pair per row. Six games would otherwise be twelve round trips on a page
   * whose entire job is to load fast.
   */
  const ids = rowsRaw.map((g) => g.id);
  const [bookings, organizers] = await Promise.all([
    ids.length
      ? service
          .from("bookings")
          .select("game_id,status")
          .in("game_id", ids)
          .in("status", ["reserved", "confirmed"])
      : Promise.resolve({ data: [] as { game_id: string; status: string }[] }),
    ids.length
      ? service
          .from("game_organizer_contacts")
          .select("game_id,organizer_name")
          .in("game_id", ids)
      : Promise.resolve({ data: [] as { game_id: string; organizer_name: string }[] }),
  ]);

  const booked = new Map<string, number>();
  for (const b of bookings.data ?? []) {
    booked.set(b.game_id, (booked.get(b.game_id) ?? 0) + 1);
  }
  const organizerOf = new Map(
    (organizers.data ?? []).map((o) => [o.game_id, o.organizer_name]),
  );

  return {
    upcomingGames: upcoming.count ?? 0,
    totalPlayers: players.count ?? 0,
    newPlayers7d: recent.count ?? 0,
    revenueMonthCzk: revenue,
    rows: rowsRaw.map((g) => ({
      id: g.id,
      venue: g.venue,
      startsAt: g.starts_at,
      capacity: g.capacity,
      booked: booked.get(g.id) ?? 0,
      status: g.status,
      format: g.format,
      organizer: organizerOf.get(g.id) ?? null,
    })),
  };
}
