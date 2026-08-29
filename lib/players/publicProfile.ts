import { createServerSupabaseClient } from "@/lib/supabase/clients";

/**
 * The public profile of one player, by nickname (round 14, item 13).
 *
 * SEVEN FIELDS SINCE ROUND 23, and the seventh is NULLABLE HERE while it is
 * not null in SQL: `players_met` arrives only once
 * `20260830100000_players_met` has been applied, and before then the composite
 * simply has six columns. `undefined` on the row therefore means "this
 * database predates the stat", which the page renders as the old third tile
 * rather than as a confident zero.
 *
 * SIX FIELDS ORIGINALLY, BECAUSE THE FUNCTION RETURNS EXACTLY WHAT IT RETURNS. `public_player_profile` is a
 * composite of exactly nickname, photo, cover and the three stats — the
 * quarantine lift's scope is enforced in SQL rather than by this module
 * choosing what to pass on. There is no wider row to accidentally spread.
 *
 * NULL FOR A GUEST, A SHADOW OR A STRANGER, identically. The RPC excludes
 * anyone with no `auth_user_id`, and the caller 404s on null without saying
 * which of the three it was — distinguishing them would answer "does this
 * nickname belong to a real account" for anyone willing to type one in.
 */
export interface PublicProfile {
  nickname: string;
  photoPath: string | null;
  coverPath: string | null;
  gamesPlayed: number;
  /**
   * Distinct pitches. NO LONGER RENDERED as a tile (round 23) and still
   * carried, because the Explorer badge is "play at 3 different pitches" and
   * the badge grid is computed from these numbers.
   */
  venues: number;
  hours: number;
  /** Null when this database has no `players_met` yet. Never zero for that. */
  playersMet: number | null;
}

export async function getPublicProfile(nickname: string): Promise<PublicProfile | null> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc("public_player_profile", {
    p_nickname: nickname,
  });

  // PostgREST returns a composite as one object, and a composite whose fields
  // are all null when the function returned NULL — so the nickname is the test
  // rather than the row's presence.
  const row = data as {
    nickname: string | null;
    photo_path: string | null;
    cover_path: string | null;
    games_played: number | null;
    hours: number | string | null;
    venues: number | null;
    players_met?: number | null;
  } | null;

  if (error || !row?.nickname) return null;

  return {
    nickname: row.nickname,
    photoPath: row.photo_path,
    coverPath: row.cover_path,
    gamesPlayed: row.games_played ?? 0,
    // `numeric` arrives as a STRING over PostgREST — `hours` is one decimal, and
    // reading it as a number without the cast prints "1.0" as `NaN` in the
    // stats block.
    hours: Number(row.hours ?? 0),
    venues: row.venues ?? 0,
    // `?? null`, NOT `?? 0`. See the header: the column's absence is a fact
    // about the database, and zero is a fact about the player.
    playersMet: row.players_met ?? null,
  };
}
