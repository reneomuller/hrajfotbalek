import { createServerSupabaseClient } from "@/lib/supabase/clients";

/**
 * The public profile of one player, by nickname (round 14, item 13).
 *
 * SIX FIELDS, BECAUSE THE FUNCTION RETURNS SIX. `public_player_profile` is a
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
  hours: number;
  venues: number;
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
  };
}
