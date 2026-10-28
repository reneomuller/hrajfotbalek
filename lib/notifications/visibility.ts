/**
 * A player's bell starts on the day their account does (round 41, owner:
 * "every signed up profile starts with a clean notifications slate").
 *
 * Broadcasts are rows with no recipient, shown to everyone — so an account
 * opened today inherited every announcement ever sent (seventeen on
 * production, from August and September). Anything ADDRESSED to a player was
 * necessarily written after that player existed, so one rule covers both
 * kinds: show what was created at or after the account.
 *
 * Applied to what `my_notifications` returns, with the join date the layout
 * has already loaded — no extra round trip on a read that runs on every page.
 */
export function sinceJoined<T extends { createdAt: string }>(
  rows: T[],
  joinedAt: string | null | undefined,
): T[] {
  if (!joinedAt) return rows;
  const joined = Date.parse(joinedAt);
  return rows.filter((row) => Date.parse(row.createdAt) >= joined);
}
