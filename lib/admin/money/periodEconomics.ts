import { getBookingSeatValues, getGameEconomics } from "@/lib/admin/economics";
import type { PeriodBounds } from "@/lib/admin/financials";
import { profitTable, seatTotals, type PlayedGame, type ProfitRow, type ProfitTotals } from "@/lib/admin/money/profitPerGame";
import { revenueMix, type RevenueMix } from "@/lib/admin/money/revenueMix";
import type { SeatBarInput } from "@/lib/admin/seatBar";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";

/**
 * What the games played in a period earned and cost (round 42, the admin
 * rebuild) — the money page's profit table and its revenue by how it was paid.
 *
 * PLAYED, NOT SCHEDULED: kicked off inside the period and marked `played` or
 * `settled`. A game still on sale has earned nothing final, and a cancelled
 * one paid for no pitch. The played sweep marks a game the night after it.
 *
 * ONLY WHEN `app_capabilities().pitchCosts` SAYS SO — the caller checks. Both
 * functions behind this are created by `20261108100000_pitch_costs.sql`, and
 * PostgREST answers a missing one with a 404.
 *
 * READS ONLY, ON THE SERVICE ROLE, like every admin aggregate.
 */
export interface PeriodEconomics {
  rows: ProfitRow[];
  totals: ProfitTotals;
  mix: RevenueMix;
  /** Every row's seats by kind, for the legend under the table. */
  seats: SeatBarInput;
}

const PLAYED_STATUSES = ["played", "settled"] as const;

async function playedGames(bounds: PeriodBounds): Promise<(PlayedGame & { priceCzk: number })[]> {
  const service = createServiceRoleSupabaseClient();
  let query = service
    .from("games")
    .select("id, starts_at, venue, price_czk")
    .in("status", [...PLAYED_STATUSES]);
  if (bounds.from) query = query.gte("starts_at", bounds.from);
  if (bounds.to) query = query.lt("starts_at", bounds.to);

  const { data, error } = await query.order("starts_at", { ascending: false });
  if (error) throw new Error(`played games read failed: ${error.message}`, { cause: error });

  return (data ?? []).map((row) => ({
    id: row.id,
    startsAt: row.starts_at,
    venue: row.venue,
    priceCzk: row.price_czk,
  }));
}

export async function getPeriodEconomics(bounds: PeriodBounds): Promise<PeriodEconomics> {
  const games = await playedGames(bounds);
  const ids = games.map((game) => game.id);

  const [byGame, values] = await Promise.all([getGameEconomics(ids), getBookingSeatValues(ids)]);

  const { rows, totals } = profitTable(games, byGame);
  return {
    rows,
    totals,
    mix: revenueMix(values, new Map(games.map((game) => [game.id, game.priceCzk]))),
    seats: seatTotals(rows),
  };
}
