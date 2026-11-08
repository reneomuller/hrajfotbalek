import { readAllPages } from "@/lib/admin/money/readAll";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";

/**
 * WHEN A GAME COUNTS AS PLAYED on the money page (2026-11-08).
 *
 * ~~`status in (played, settled)`~~ — the nightly sweep marks a game played at
 * 06:30 the next morning, so the evening's game sat outside "games settled",
 * the average and the profit table until then. The owner counted three games
 * where the page said two: production's #10 kicked off at 17:00 and was still
 * "full". A game counts once it has KICKED OFF and was not cancelled (or left
 * a draft) — the games list's own rule (`lib/admin/games/tabs.ts`).
 */
const PLAYABLE_STATUSES = ["published", "full", "played", "settled"] as const;

export function hasBeenPlayed(game: { status: string; starts_at: string }, now: number): boolean {
  return (PLAYABLE_STATUSES as readonly string[]).includes(game.status) && Date.parse(game.starts_at) <= now;
}

export interface PlayedGame {
  id: string;
  startsAt: string;
  venue: string;
  priceCzk: number;
}

/** Games played in a period — kicked off inside it and before `now`. Newest first. */
export async function playedGamesBetween(
  bounds: { from: string | null; to: string | null },
  now: number,
): Promise<PlayedGame[]> {
  const service = createServiceRoleSupabaseClient();
  const nowIso = new Date(now).toISOString();
  const until = bounds.to && bounds.to < nowIso ? bounds.to : nowIso;

  const rows = await readAllPages("played games", (from, to) => {
    let query = service
      .from("games")
      .select("id,status,starts_at,venue,price_czk")
      .in("status", [...PLAYABLE_STATUSES])
      .lt("starts_at", until);
    if (bounds.from) query = query.gte("starts_at", bounds.from);
    return query.order("starts_at", { ascending: false }).order("id").range(from, to);
  });

  return rows
    .filter((row) => hasBeenPlayed(row, now))
    .map((row) => ({ id: row.id, startsAt: row.starts_at, venue: row.venue, priceCzk: row.price_czk }));
}
