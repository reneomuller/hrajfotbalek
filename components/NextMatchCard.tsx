import Link from "next/link";
import { AvatarRow } from "@/components/game/AvatarRow";
import { CapacityBar } from "@/components/game/CapacityBar";
import { FormatChips } from "@/components/game/FormatChips";
import { ShareButton } from "@/components/game/ShareButton";
import { VenueMapPanel, type VenueMapPanelProps } from "@/components/VenueMapPanel";
import { formatGameDateTime } from "@/lib/format";
import { gameUrgency, spotsLeftLabel, urgencyLabel } from "@/lib/games/urgency";
import { strings } from "@/lib/strings";
import type { GameCardGame } from "@/components/GameCard";

const { games, landing } = strings;

/**
 * The landing page's next-match block, ported from the `index.html` reference.
 *
 * Two columns that stack below 300px each: venue and map on the left, capacity
 * and lineup on the right. Everything that was hardcoded in the reference —
 * the date, the `08/14` counter, the capacity bar, the roster avatars, the
 * spots-left number — is live data here. Nothing else about it changed.
 *
 * ESCAPING: `venue` and every `nickname` are free text rendered as JSX
 * children, which React escapes. The map link builds a query string through
 * `encodeURIComponent`.
 */

export interface NextMatchCardProps {
  game: GameCardGame;
  bookedCount: number;
  /** Nicknames of the active roster, in join order. */
  roster: string[];
  /**
   * The venue row behind `game.venue_id`, when there is one.
   *
   * Replaces the name-matching hack this card shipped with, which showed the
   * one committed map only for venues whose name contained "prazacka". Which
   * photo belongs to which venue is a column now, set by the organizer when
   * they add the venue.
   */
  venueRow: VenueMapPanelProps["venueRow"];
  /** Absolute URL to this game, for the share link. */
  shareUrl?: string;
}

export function NextMatchCard({
  game,
  bookedCount,
  roster,
  venueRow,
  shareUrl,
}: NextMatchCardProps) {
  const filled = Math.min(bookedCount, game.capacity);
  const urgency = gameUrgency(bookedCount, game.capacity);
  const isFull = urgency === "full";
  const when = formatGameDateTime(game.starts_at);

  return (
    <div
      data-testid="next-game"
      className="flex flex-wrap overflow-hidden rounded-panel border border-hairline-volt bg-surface-panel"
    >
      {/* LEFT — info + map */}
      <div className="min-w-[300px] flex-1 border-r border-hairline-soft">
        <div className="px-6 pb-4 pt-[22px]">
          <div className="flex items-center justify-between gap-3">
            <div className="font-mono text-[11px] uppercase tracking-[1px] text-chalk">
              {when}
            </div>
            <FormatChips
              format={game.format}
              surface={game.surface}
              capacity={game.capacity}
              size="slim"
            />
          </div>

          <div className="mt-[10px] font-condensed text-match-title font-bold text-white">
            {game.venue}
          </div>
        </div>

        <VenueMapPanel venue={game.venue} venueRow={venueRow} />
      </div>

      {/* RIGHT — capacity + lineup + join */}
      <div className="flex min-w-[300px] flex-1 flex-col px-6 py-[22px]">
        <div className="mb-[10px] flex items-baseline justify-between">
          {/* The urgency ladder, same rungs and same thresholds as the list
              cards and the game page — see lib/games/urgency.ts. */}
          <span
            data-testid="urgency-label"
            className={`font-mono text-[10px] uppercase tracking-[2px] ${
              isFull ? "text-faint" : "text-volt-dim"
            }`}
          >
            {urgencyLabel(urgency)}
          </span>
          <span
            data-testid="spots-counter"
            className="font-mono text-[22px] font-bold text-white"
          >
            {String(filled).padStart(2, "0")}/{game.capacity}
          </span>
        </div>

        <CapacityBar bookedCount={bookedCount} capacity={game.capacity} />

        <div className="mt-[18px] flex flex-wrap items-center gap-x-3 gap-y-2 pl-2">
          <AvatarRow names={roster} max={14} />
          <span className="text-[13px] text-muted-dim">
            <b className={isFull ? "text-faint" : "text-volt"}>
              {spotsLeftLabel(bookedCount, game.capacity)}
            </b>
          </span>
        </div>

        <div className="flex-1" />

        <Link
          href={`/game/${game.id}`}
          aria-disabled={isFull}
          className={`mt-[22px] block w-full rounded-cta bg-volt px-4 py-[15px] text-center font-condensed text-[19px] font-extrabold uppercase tracking-wide text-surface no-underline ${
            isFull ? "opacity-60" : ""
          }`}
        >
          {isFull ? games.full : landing.nextMatchCta}
        </Link>
        <div className="mt-[9px] text-center text-[11px] text-hint">
          {games.joinNote}
        </div>

        {shareUrl && (
          <div className="mt-4 flex justify-center">
            <ShareButton venue={game.venue} when={when} url={shareUrl} />
          </div>
        )}
      </div>
    </div>
  );
}
