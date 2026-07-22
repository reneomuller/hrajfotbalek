import { strings } from "@/lib/strings";

/**
 * The urgency ladder, as a pure function of the count.
 *
 * Three rungs, and the thresholds live here rather than at a render site
 * because there are now four places that need the same answer — the list card,
 * the landing card, the game page and the OG description — and four inline
 * `spotsLeft <= 3` comparisons is how they end up disagreeing about what
 * "almost full" means.
 *
 * `lastFew` is a PROPORTION, not a fixed number, with a floor. On a 12-a-side
 * game three spots is a quarter of the pitch and genuinely urgent; on a 22-spot
 * game it is not, and a fixed threshold would cry wolf on the big games and
 * stay silent on the small ones until it was too late. A quarter of capacity,
 * minimum 1 and capped at 3, matches how a player reads the notch bar.
 *
 * The copy that goes with each rung is in `strings.games.urgency*` — nothing
 * here builds a sentence.
 */

export type Urgency = "open" | "lastFew" | "full";

/** How many spots left still counts as "almost full", for a given capacity. */
export function lastFewThreshold(capacity: number): number {
  const spots = Math.max(0, Math.trunc(capacity));
  return Math.min(3, Math.max(1, Math.round(spots / 4)));
}

export function gameUrgency(bookedCount: number, capacity: number): Urgency {
  const spots = Math.max(0, Math.trunc(capacity));
  const left = Math.max(0, spots - Math.max(0, Math.trunc(bookedCount)));

  if (left === 0) return "full";
  if (left <= lastFewThreshold(spots)) return "lastFew";
  return "open";
}

/** The eyebrow copy for a rung. */
export function urgencyLabel(urgency: Urgency): string {
  switch (urgency) {
    case "full":
      return strings.games.urgencyFull;
    case "lastFew":
      return strings.games.urgencyLastFew;
    default:
      return strings.games.urgencyOpen;
  }
}

/**
 * "3 spots left" / "1 spot left", or the full label.
 *
 * The singular is not cosmetic: "1 spots left" on the last spot of a game is
 * the exact moment the copy is being read most carefully.
 */
export function spotsLeftLabel(bookedCount: number, capacity: number): string {
  const left = Math.max(0, Math.trunc(capacity) - Math.trunc(bookedCount));
  if (left === 0) return strings.games.full;
  return `${left} ${left === 1 ? strings.games.spotLeft : strings.games.spotsLeft}`;
}
