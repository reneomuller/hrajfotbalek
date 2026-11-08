/**
 * WHO COUNTS AS A PLAYER in the admin's numbers (round 42, the admin rebuild).
 *
 * The owner: "don't count shadow accounts that we regularly use for booking
 * games and other stuff." A shadow is a players row with no login — a name the
 * admin books onto a game — and it is not a person who signed up. Deleted
 * accounts and seed fixtures are not players either.
 *
 * ONE DEFINITION, because there were two: the dashboard's "Total players"
 * counted signed-up accounts while the players page listed every row, so the
 * two pages disagreed about the same number. Every count, segment and
 * breakdown goes through this; the players LIST may still show shadows behind
 * their own filter, because an admin needs to find one to book or merge it.
 *
 * The Supabase filter that matches it is `COUNTED_PLAYER_FILTER` below — keep
 * the two together.
 */
export interface PlayerScopeFields {
  auth_user_id: string | null;
  deleted_at: string | null;
  is_seed: boolean;
}

export function isCountedPlayer(player: PlayerScopeFields): boolean {
  return player.auth_user_id !== null && player.deleted_at === null && !player.is_seed;
}

/**
 * The same rule as a PostgREST query, for counts that should not fetch rows:
 *
 *   query.not("auth_user_id", "is", null).is("deleted_at", null).eq("is_seed", false)
 */
export const COUNTED_PLAYER_FILTER = {
  notNull: "auth_user_id",
  isNull: "deleted_at",
  isFalse: "is_seed",
} as const;
