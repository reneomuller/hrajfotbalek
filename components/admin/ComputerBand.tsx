import { VENUE_WIDE_BAND } from "@/lib/storage/avatar";
import { strings } from "@/lib/strings";

/**
 * What a COMPUTER shows of a venue photo, drawn over the frame (2026-11-16).
 *
 * On a phone the game card is the frame's shape and shows all of it. On a
 * computer the card is twice as wide for its height, so it shows the centred
 * band this outlines (`VENUE_WIDE_BAND`). The owner: "it can look differently
 * than on the phone, but when we choose the photo, it's somehow gotta look good
 * on both, not just one of them" — so the crop window shows both at once.
 *
 * Fills its nearest positioned ancestor, which must be the frame's own box.
 * The top and height are computed from the measured card, hence inline.
 */
export function ComputerBand() {
  const top = `${((1 - VENUE_WIDE_BAND) / 2) * 100}%`;
  const height = `${VENUE_WIDE_BAND * 100}%`;

  return (
    <span
      aria-hidden
      data-testid="computer-band"
      className="pointer-events-none absolute inset-x-0 border-y-2 border-dashed border-white/80"
      style={{ top, height }}
    >
      <span className="absolute left-2 top-1 rounded-pill bg-ink/70 px-2 py-px text-[10px] font-semibold text-white">
        {strings.admin.venueCropComputer}
      </span>
    </span>
  );
}
