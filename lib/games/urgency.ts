import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { pluralise } from "@/lib/i18n/plural";
import { strings, type Strings } from "@/lib/strings";

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

/**
 * THE COLOUR LADDER, which is a different question from the copy ladder above.
 *
 * `gameUrgency` asks "is this game nearly gone, relative to its own size" — a
 * proportion, because three spots on a 22-a-side game is not the same news as
 * three on a 12. `spotsTone` asks "what colour is this number", and v1.2 §5.5
 * rules that in ABSOLUTE spots: amber at ten or fewer, red at three or fewer.
 *
 * They are deliberately not the same function. Colour is read pre-attentively,
 * before the reader has taken in the capacity — it has to mean the same thing
 * on every row of a list where the games are different sizes, and a
 * proportional colour would paint a nearly-empty 8-a-side red beside a
 * half-full 20-a-side in volt. The copy, which is read after the number, can
 * afford to be relative.
 *
 * THE CONSEQUENCE IS VISIBLE AND INTENDED: a 16-spot game with 4 left is amber
 * while its eyebrow still reads "Spots open", because four of sixteen is not
 * proportionally urgent and four spots is still few. Recorded so the next
 * reader does not "fix" it into agreement.
 */
export type SpotsTone = "plenty" | "few" | "critical" | "full";

/** Ten or fewer spots turns the number amber. */
export const SPOTS_TONE_FEW = 10;
/** Three or fewer turns it red. */
export const SPOTS_TONE_CRITICAL = 3;

/** How many spots are actually left, floored at zero. */
export function spotsLeftCount(bookedCount: number, capacity: number): number {
  return Math.max(0, Math.trunc(capacity) - Math.max(0, Math.trunc(bookedCount)));
}

export function spotsTone(bookedCount: number, capacity: number): SpotsTone {
  const left = spotsLeftCount(bookedCount, capacity);
  if (left === 0) return "full";
  if (left <= SPOTS_TONE_CRITICAL) return "critical";
  if (left <= SPOTS_TONE_FEW) return "few";
  return "plenty";
}

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
export function urgencyLabel(urgency: Urgency, t: Strings = strings): string {
  switch (urgency) {
    case "full":
      return t.games.urgencyFull;
    case "lastFew":
      return t.games.urgencyLastFew;
    default:
      return t.games.urgencyOpen;
  }
}

/**
 * "3 spots left" / "1 spot left", or the full label.
 *
 * The singular is not cosmetic: "1 spots left" on the last spot of a game is
 * the exact moment the copy is being read most carefully.
 */
export function spotsLeftLabel(
  bookedCount: number,
  capacity: number,
  locale: Locale = DEFAULT_LOCALE,
  t: Strings = strings,
): string {
  const left = Math.max(0, Math.trunc(capacity) - Math.trunc(bookedCount));
  if (left === 0) return t.games.full;
  /*
   * THE COUNT PICKS THE FORM, AND CLDR PICKS WHICH COUNT MEANS WHICH FORM
   * (round 22). This was `left === 1 ? spotLeft : spotsLeft` — an English
   * two-form rule applied to four languages, three of which have a 2-4 form.
   * "3 volných míst" and "3 місць вільно" were both the 5+ form, and three
   * free spots is squarely inside the range this row spends most of its life
   * in.
   */
  return pluralise(
    {
      one: t.games.spotsLeftOne,
      few: t.games.spotsLeftFew,
      many: t.games.spotsLeftMany,
    },
    left,
    locale,
  );
}
