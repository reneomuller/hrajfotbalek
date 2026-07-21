import { formatGameDateTime } from "@/lib/format";
import { strings } from "@/lib/strings";

/**
 * The ticker's text, as a pure function of the game.
 *
 * Split out of the component so the three cases — live, upcoming, nothing —
 * are testable without a DOM. `null` means render nothing at all: an empty
 * ticker beats one announcing a game that does not exist.
 */
export function tickerText(
  entry: { venue: string; startsAt: string; isLive: boolean } | null,
): string | null {
  if (!entry) return null;

  if (entry.isLive) {
    return `${strings.ticker.live} · ${entry.venue}`;
  }
  return `${strings.ticker.upcoming} · ${entry.venue} · ${formatGameDateTime(entry.startsAt)}`;
}
