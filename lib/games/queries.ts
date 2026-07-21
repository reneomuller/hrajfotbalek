import { policy } from "@/lib/policy";
import { createServerSupabaseClient } from "@/lib/supabase/clients";
import type { Database } from "@/lib/types/database";

type GameRow = Database["public"]["Tables"]["games"]["Row"];
type RosterRow = Database["public"]["Views"]["game_roster_public"]["Row"];

/**
 * Read paths for the player-facing game surfaces.
 *
 * WHY THE COUNT COMES FROM `game_roster_public` AND NOT `bookings`:
 * `bookings` is granted to `authenticated` only and carries own-row RLS, so an
 * anonymous visitor counting it gets zero rows — not an error, just a silently
 * wrong counter. `game_roster_public` is the anon-readable projection and it
 * already filters to active bookings (`reserved` + `confirmed`) on publicly
 * visible games, which is exactly the capacity definition `create_booking`
 * enforces. Counting it keeps the displayed number and the RPC's decision in
 * agreement for signed-out and signed-in visitors alike.
 *
 * The counter is computed server-side on load and may be slightly stale by the
 * time it is read. That is accepted: `create_booking` is the authority on
 * whether a spot exists, and a stale-by-seconds number is far safer than a
 * client-side one that drifts.
 */

export const PUBLIC_GAME_STATUSES = [
  "published",
  "full",
  "played",
  "settled",
] as const;

export interface GameWithCount {
  game: GameRow;
  bookedCount: number;
  spotsLeft: number;
  /**
   * Whether kick-off has passed.
   *
   * Computed here rather than in a component: reading the clock during render
   * is impure, and the value is only ever used to mirror a rule the RPCs
   * enforce anyway. The query layer already runs per request, so this is the
   * honest place for it.
   */
  hasStarted: boolean;
  isCancelled: boolean;
}

function decorate(game: GameRow, bookedCount: number, now: number): GameWithCount {
  return {
    game,
    bookedCount,
    spotsLeft: Math.max(0, game.capacity - bookedCount),
    hasStarted: new Date(game.starts_at).getTime() <= now,
    isCancelled: game.status === "cancelled",
  };
}

/** Counts active roster rows per game id, in one round trip. */
async function countRosterByGame(gameIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (gameIds.length === 0) return counts;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("game_roster_public")
    .select("game_id")
    .in("game_id", gameIds);

  if (error || !data) return counts;

  for (const row of data as Pick<RosterRow, "game_id">[]) {
    counts.set(row.game_id, (counts.get(row.game_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Upcoming publicly-visible games, soonest first.
 *
 * The `status` filter is defence in depth, not the enforcement point: the
 * `games_select_public` RLS policy already hides draft and cancelled games
 * from anon and authenticated alike. Stating it here as well means a future
 * policy change cannot silently widen this surface.
 */
export async function listUpcomingGames(limit = 20): Promise<GameWithCount[]> {
  const supabase = await createServerSupabaseClient();

  const { data: games, error } = await supabase
    .from("games")
    .select("*")
    .in("status", ["published", "full"])
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(limit);

  if (error || !games) return [];

  const counts = await countRosterByGame(games.map((g) => g.id));
  const now = Date.now();

  return games.map((game) => decorate(game, counts.get(game.id) ?? 0, now));
}

/** The soonest upcoming game, for the landing next-match block. */
export async function getNextGame(): Promise<GameWithCount | null> {
  const games = await listUpcomingGames(1);
  return games[0] ?? null;
}

export interface TickerGame {
  game: GameRow;
  /** Kick-off has passed and the game is still within its playing window. */
  isLive: boolean;
}

/**
 * What the landing ticker announces: a game happening right now, else the next
 * one, else nothing.
 *
 * A game in progress is invisible to `listUpcomingGames` — that query starts at
 * `now()` — so this looks back by the policy's game duration to find one. There
 * is no `ends_at` column yet; `policy.game.durationMinutes` stands in for it and
 * is display-only.
 */
export async function getTickerGame(): Promise<TickerGame | null> {
  const supabase = await createServerSupabaseClient();
  const now = Date.now();
  const windowStart = new Date(
    now - policy.game.durationMinutes * 60_000,
  ).toISOString();

  const { data, error } = await supabase
    .from("games")
    .select("*")
    .in("status", ["published", "full"])
    .gte("starts_at", windowStart)
    .order("starts_at", { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) return null;

  const game = data[0];
  return { game, isLive: new Date(game.starts_at).getTime() <= now };
}

/**
 * A single game by id, or null when it is not publicly visible.
 *
 * A draft or cancelled game returns null through RLS rather than 403, so the
 * page renders a not-found state — which is the correct disclosure: an
 * anonymous visitor learns nothing about whether the id exists.
 */
export async function getGameById(id: string): Promise<GameWithCount | null> {
  const supabase = await createServerSupabaseClient();

  const { data: game, error } = await supabase
    .from("games")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !game) return null;

  const counts = await countRosterByGame([game.id]);
  return decorate(game, counts.get(game.id) ?? 0, Date.now());
}

/** The PII-safe roster for a game. */
export async function getRoster(gameId: string): Promise<RosterRow[]> {
  const supabase = await createServerSupabaseClient();

  // PII BOUNDARY: this projection is nickname + status only, and must stay
  // that way. The view cannot expose player_id/email/phone — it does not
  // project them — but selecting `*` here would still be a latent hazard if
  // the view were ever widened, so the columns are named explicitly.
  const { data, error } = await supabase
    .from("game_roster_public")
    .select("game_id, nickname, status")
    .eq("game_id", gameId);

  if (error || !data) return [];
  return data as RosterRow[];
}
