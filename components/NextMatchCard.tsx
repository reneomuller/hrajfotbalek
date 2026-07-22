import Link from "next/link";
import { VenueMapPanel, type VenueMapPanelProps } from "@/components/VenueMapPanel";
import { formatGameDateTime } from "@/lib/format";
import { capacitySegments } from "@/lib/games/capacity";
import { initials } from "@/lib/roster/initials";
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
}

export function NextMatchCard({
  game,
  bookedCount,
  roster,
  venueRow,
}: NextMatchCardProps) {
  const filled = Math.min(bookedCount, game.capacity);
  const spotsLeft = Math.max(0, game.capacity - bookedCount);
  const isFull = spotsLeft === 0;
  // The organizer's own words win over the derived guess: "6v6" is a fact
  // about the game, while capacity/2 infers it from a number that also counts
  // substitutes. Without either, no chip rather than a rounded lie.
  const perSide = game.capacity % 2 === 0 ? game.capacity / 2 : null;
  const formatChip = game.format ?? (perSide !== null ? `${perSide}v${perSide}` : null);

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
              {formatGameDateTime(game.starts_at)}
            </div>
            <div className="flex items-center gap-2">
              {formatChip && (
                <div className="rounded-chip bg-volt px-2 py-1 font-mono text-[9px] font-bold tracking-[1px] text-surface">
                  {formatChip}
                </div>
              )}
              {game.surface && (
                <div className="rounded-chip border border-hairline-strong px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[1px] text-muted">
                  {games.surface[game.surface]}
                </div>
              )}
            </div>
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
          <span className="font-mono text-[10px] tracking-[2px] text-volt-dim">
            {games.filledLabel}
          </span>
          <span
            data-testid="spots-counter"
            className="font-mono text-[22px] font-bold text-white"
          >
            {String(filled).padStart(2, "0")}/{game.capacity}
          </span>
        </div>

        {/*
          Capacity bar — one segment per spot, per the reference's `data-segs`
          block: `display:flex;gap:4px` around `flex:1;height:11px;
          border-radius:2px` notches, volt when filled and #242424 when not.
          Every value here is a theme token standing for that literal.
        */}
        <div data-testid="capacity-segments" className="flex gap-1">
          {capacitySegments(bookedCount, game.capacity).map((isFilled, i) => (
            <i
              key={i}
              className={`h-[11px] flex-1 rounded-[2px] ${
                isFilled ? "bg-volt" : "bg-surface-seg"
              }`}
            />
          ))}
        </div>

        <div className="mt-[18px] flex flex-wrap items-center gap-y-2 pl-2">
          <div className="flex flex-wrap items-center gap-y-[6px]">
            {roster.map((nickname, i) => (
              <span
                key={`${nickname}-${i}`}
                title={nickname}
                className={`-ml-2 flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 border-surface-raised bg-surface-avatar font-condensed text-[13px] font-bold ${
                  i % 3 === 0 ? "text-volt" : "text-bone"
                }`}
              >
                {initials(nickname)}
              </span>
            ))}
          </div>
          <span className="ml-3 text-[13px] text-muted-dim">
            <b className="text-volt">+{spotsLeft}</b>{" "}
            {spotsLeft === 1 ? games.spotLeft : games.spotsLeft}
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
      </div>
    </div>
  );
}
