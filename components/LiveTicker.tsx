import type { TickerGame } from "@/lib/games/queries";
import { tickerText } from "@/lib/games/ticker";

/**
 * The status ticker under the header.
 *
 * Sits in the gap between the header's bottom edge and the top touchline of
 * the background pitch, which is why it is fixed rather than part of the hero
 * flow. The reference had a hardcoded "LIVE · PRAHA 3 — PRAŽAČKA" here; this
 * says what is actually true.
 *
 * Renders nothing at all when there is no game — an empty ticker is better
 * than one announcing a match that does not exist.
 */
export function LiveTicker({ entry }: { entry: TickerGame | null }) {
  const text = tickerText(
    entry && {
      venue: entry.game.venue,
      startsAt: entry.game.starts_at,
      isLive: entry.isLive,
    },
  );
  if (!entry || !text) return null;

  const { isLive } = entry;

  return (
    <div
      data-testid="live-ticker"
      data-live={isLive}
      className="pointer-events-none fixed inset-x-0 top-[61px] z-20 flex justify-center px-gutter"
    >
      <div className="flex items-center gap-[10px] font-mono text-eyebrow tracking-eyebrow text-volt-dim">
        {isLive && (
          <span className="h-[7px] w-[7px] animate-blink rounded-full bg-volt shadow-volt-glow" />
        )}
        {/* `venue` is free text; JSX text interpolation escapes it. */}
        <span className="truncate">{text}</span>
      </div>
    </div>
  );
}
