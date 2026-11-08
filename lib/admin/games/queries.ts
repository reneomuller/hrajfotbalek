import {
  getBookingSeatValues,
  getGameEconomics,
  getGamePitchCost,
  type GameEconomics,
  type GamePitchCost,
} from "@/lib/admin/economics";
import { latestCancelReasons } from "@/lib/admin/games/cancelReasons";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";
import type { BookingSeatValue } from "@/lib/types/database";

/**
 * The games hub's own reads (round 42, the admin rebuild) — kept out of
 * `lib/admin/queries.ts` so the rebuild's pieces could be written side by side.
 *
 * SERVICE ROLE, for the reason that file gives: `events` grants nothing to a
 * session, the admin's own included. Every caller sits under the admin layout's
 * `requireAdmin()`.
 */

/**
 * Why each of these games was cancelled, keyed by game id — read off the
 * `game_cancelled` events `cancel_game_with_reason` wrote its reason onto. A
 * game with no recorded reason is absent; a failed read is an empty map, and
 * the list says "no reason recorded" rather than failing the page over a line
 * of context.
 */
export async function getCancelReasons(gameIds: string[]): Promise<Map<string, string>> {
  if (gameIds.length === 0) return new Map();

  const service = createServiceRoleSupabaseClient();
  const { data, error } = await service
    .from("events")
    .select("game_id, created_at, metadata")
    .eq("event_type", "game_cancelled")
    .in("game_id", gameIds);

  if (error || !data) return new Map();
  return latestCancelReasons(data);
}

export interface GameMoney {
  economics: GameEconomics | null;
  /** What each booking on the game earned — the seat grid's colours. */
  seatValues: BookingSeatValue[];
  pitch: GamePitchCost | null;
}

/**
 * Everything the game page draws its money and its seat grid from, in one
 * round of reads. ONLY once `app_capabilities()` says `pitchCosts` — before the
 * migration none of these objects exist, and the caller must not ask.
 */
export async function getGameMoney(gameId: string): Promise<GameMoney> {
  const [economics, seatValues, pitch] = await Promise.all([
    getGameEconomics([gameId]),
    getBookingSeatValues([gameId]),
    getGamePitchCost(gameId),
  ]);
  return { economics: economics.get(gameId) ?? null, seatValues, pitch };
}
