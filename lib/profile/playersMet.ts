import { createServerSupabaseClient } from "@/lib/supabase/clients";

/**
 * "Players met" for one player, by id (round 23, item 1).
 *
 * NULL MEANS "THIS DATABASE CANNOT ANSWER", NOT ZERO, and the distinction is
 * the whole reason this returns a nullable. Until `20260830100000_players_met`
 * is applied, `players_met` does not exist and PostgREST answers a missing
 * function with a 404 — which is indistinguishable from a real error and is
 * absolutely distinguishable from "you have met nobody". A zero here would
 * render a confident `0 players met` on the profile of someone with a hundred
 * games, on every request, until somebody noticed.
 *
 * So the caller gets null and keeps rendering the old third tile. That is the
 * same capability-gate shape `lib/db/capabilities.ts` documents at length, one
 * layer lower: the flag says whether to ASK, and this says whether an answer
 * arrived.
 *
 * THE DEFINITION IS NOT RESTATED HERE, deliberately. It is one SQL function,
 * called from two surfaces, and the public profile reaches it through
 * `public_player_profile` rather than through this module — so there is exactly
 * one place where "who counts as met" is written down. A TypeScript
 * reimplementation for the owner's own page is how the roster's `games_played`
 * and the profile's would have drifted, which is why that one is derived from
 * a single definition too.
 */
export async function playersMetFor(playerId: string): Promise<number | null> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc("players_met", {
    p_player_id: playerId,
  });

  if (error || typeof data !== "number") return null;
  return data;
}
