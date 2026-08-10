import { strings, type Strings } from "@/lib/strings";

/**
 * The preferred-position catalog, app-side (ruling L, §2.8).
 *
 * THIS LIST AND `players_positions_catalog` ARE ONE RULE IN TWO PLACES, and
 * the CHECK is the enforcement. This exists so an unknown code renders as
 * nothing rather than as a chip with a missing label, and so widening the
 * constraint has an obvious second place to widen — the same shape as the
 * amenity catalog and the event-type catalog, the latter of which has already
 * been forgotten once.
 *
 * CODES, NOT WORDS, IN THE COLUMN. The labels are translated into three
 * languages; a column holding "Brankář" for one player and "Goalkeeper" for
 * another is a column nobody can group by, and it would make the CHECK a list
 * of every translation.
 *
 * FOUR, DELIBERATELY. A pickup game does not need to tell a left wing-back
 * from a right one, and a chip set that tries is a form nobody finishes. The
 * order is the render order and runs back to front, the way a team sheet reads.
 */
export const POSITIONS = ["gk", "def", "mid", "att"] as const;

export type Position = (typeof POSITIONS)[number];

export function isPosition(value: unknown): value is Position {
  return typeof value === "string" && (POSITIONS as readonly string[]).includes(value);
}

/** The label for a code, in the reader's language. */
export function positionLabel(position: Position, t: Strings = strings): string {
  return t.profile.positions[position];
}

/**
 * The stored value for a set of submitted codes.
 *
 * FILTERS TO THE CATALOG AND DEDUPES, in catalog order. Both CHECKs would
 * refuse anything else, and a constraint violation surfaces as a Postgres
 * error naming a constraint rather than as something the form can explain — so
 * the form never sends one. Order is normalised too, so two players who ticked
 * the same chips in a different sequence produce the same row.
 */
export function normalisePositions(values: readonly string[]): Position[] {
  return POSITIONS.filter((position) => values.includes(position));
}
