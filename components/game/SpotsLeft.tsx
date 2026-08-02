import { spotsLeftLabel, spotsTone, type SpotsTone } from "@/lib/games/urgency";
import { getStrings } from "@/lib/i18n/server";

/**
 * "4 spots left", in the colour the count earns (v1.2 §5.5).
 *
 * THIS IS THE FOMO ELEMENT, and it is the reason the row exists at the size it
 * does. Everything else on a list row answers "is this game for me"; this
 * answers "do I have to decide now", which is the question that gets someone to
 * tap. It was previously an 11px muted-grey aside sitting at the same weight as
 * the surface label, which is to say it was invisible.
 *
 * ONE TONE TABLE, USED BY BOTH THE NUMBER AND THE BAR. `CapacityBar` imports
 * `TONE_FILL` from here rather than keeping its own copy — a bar that is amber
 * beside a number that is red is worse than no colour at all, and two tables
 * are how that happens. The thresholds themselves are in `lib/games/urgency.ts`
 * so nothing here decides anything.
 *
 * Colour is never the only carrier: the count is written out in words beside
 * it. Roughly one man in twelve cannot separate the amber from the red, and the
 * whole point of this element is that it works at a glance.
 */

/** Text colour per rung. Full is deliberately grey — it is not an alarm. */
const TONE_TEXT: Record<SpotsTone, string> = {
  plenty: "text-volt",
  few: "text-warn",
  critical: "text-danger",
  full: "text-faint",
};

/**
 * Bar fill per rung, same ladder. Imported by `CapacityBar`.
 *
 * `full` is grey but NOT the unfilled grey. A full game has every segment
 * filled, so painting the fill `surface-seg` would render a complete bar as an
 * empty one — the two states would be pixel-identical and the reader would
 * conclude nobody had signed up. `subtle` reads as filled against
 * `surface-seg` while carrying none of the urgency the other three do.
 */
export const TONE_FILL: Record<SpotsTone, string> = {
  plenty: "bg-volt",
  few: "bg-warn",
  critical: "bg-danger",
  full: "bg-subtle",
};

export async function SpotsLeft({
  bookedCount,
  capacity,
  /**
   * `row` is the games list; `hero` is the availability card on the detail,
   * where this is the largest thing on the card by design.
   */
  size = "row",
}: {
  bookedCount: number;
  capacity: number;
  size?: "row" | "hero";
}) {
  const t = await getStrings();
  const tone = spotsTone(bookedCount, capacity);

  return (
    <span
      data-testid="spots-left"
      data-tone={tone}
      className={`font-condensed font-bold leading-none tracking-tight ${
        size === "hero" ? "text-[30px]" : "text-[16px]"
      } ${TONE_TEXT[tone]}`}
    >
      {tone === "full" ? t.games.full : spotsLeftLabel(bookedCount, capacity, t)}
    </span>
  );
}
