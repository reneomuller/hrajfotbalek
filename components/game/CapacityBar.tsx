import { TONE_FILL } from "@/components/game/SpotsLeft";
import { capacitySegments } from "@/lib/games/capacity";
import { spotsTone } from "@/lib/games/urgency";

/**
 * The segmented capacity bar from the design reference's `data-segs` block:
 * `display:flex;gap:4px` around `flex:1;height:11px;border-radius:2px` notches,
 * volt when filled and #242424 when not.
 *
 * ONE NOTCH PER SPOT, NEVER A PERCENTAGE. The player counts notches — that is
 * what makes "two left" legible at a glance on a phone without reading a
 * number. A proportional bar would be the same information rendered as
 * something nobody can count.
 *
 * Extracted here because the bar now appears at every surface a count does:
 * the list cards, the landing card, and the game page. It shipped on the
 * landing card alone and was reimplemented as a proportional bar on the game
 * page, which is exactly the drift this prevents.
 *
 * THE FILL TAKES THE SPOTS-LEFT TONE (v1.2 §5.5) from the same table the number
 * uses, so the bar and the count can never disagree. `TONE_FILL` lives beside
 * the number for that reason and is imported rather than restated.
 */
export function CapacityBar({
  bookedCount,
  capacity,
  /** The list cards run a slimmer bar than the two hero surfaces. */
  size = "default",
}: {
  bookedCount: number;
  capacity: number;
  size?: "default" | "slim";
}) {
  const fill = TONE_FILL[spotsTone(bookedCount, capacity)];

  return (
    <div data-testid="capacity-segments" className="flex gap-1">
      {capacitySegments(bookedCount, capacity).map((isFilled, i) => (
        <i
          key={i}
          className={`flex-1 rounded-[2px] ${size === "slim" ? "h-[7px]" : "h-[11px]"} ${
            isFilled ? fill : "bg-surface-seg"
          }`}
        />
      ))}
    </div>
  );
}
