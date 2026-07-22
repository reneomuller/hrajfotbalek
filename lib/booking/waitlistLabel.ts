import { strings } from "@/lib/strings";

/**
 * The "You're #2 in line" label, or null when there is nothing to say.
 *
 * Null rather than a fallback string: the position comes from an RPC that
 * returns null for a player who is not on the list, and inventing "#1" or "#—"
 * for that case would be a claim the database did not make. A null here means
 * the line is not rendered at all.
 *
 * A non-positive or non-integer position is treated the same way — the only
 * way to get one is a bug, and a wrong number is worse than a missing one.
 */
export function waitlistPositionLabel(position: number | null): string | null {
  if (position === null || !Number.isInteger(position) || position < 1) {
    return null;
  }
  return strings.games.waitlistPosition.replace("{position}", String(position));
}
