import Link from "next/link";
import { AvatarRow } from "@/components/game/AvatarRow";
import { CapacityBar } from "@/components/game/CapacityBar";
import { FormatChips } from "@/components/game/FormatChips";
import { ShareButton } from "@/components/game/ShareButton";
import { VenueMapPanel, type VenueMapPanelProps } from "@/components/VenueMapPanel";
import { formatCzk, formatGameDateTime } from "@/lib/format";
import { gameUrgency, spotsLeftLabel, urgencyLabel } from "@/lib/games/urgency";
import { strings } from "@/lib/strings";
import type { Database } from "@/lib/types/database";

type GameRow = Database["public"]["Tables"]["games"]["Row"];

export type GameCardGame = Pick<
  GameRow,
  | "id"
  | "venue"
  | "venue_id"
  | "starts_at"
  | "capacity"
  | "price_czk"
  | "status"
  | "format"
  | "surface"
>;

export interface GameCardProps {
  game: GameCardGame;
  /** Active bookings (reserved + confirmed) counted server-side. */
  bookedCount: number;
  /** Nicknames on the roster, in join order. From `game_roster_public`. */
  roster?: string[];
  /** The venue row behind `game.venue_id`, for the map panel's photo. */
  venueRow?: VenueMapPanelProps["venueRow"];
  /** Absolute URL to this game, for the share link. */
  shareUrl?: string;
  /** True when the signed-in player holds a waitlist row on this game. */
  onWaitlist?: boolean;
}

/**
 * The match card — the shared unit across `/games`.
 *
 * WHAT CHANGED AND WHY. This was a two-line summary: venue, date, price, a
 * spots chip. The design reference's card is a different object — a traced map
 * panel, the lineup as overlapping avatars, one notch per spot — and the list
 * was the one surface that had never been given it, so `/games` and the landing
 * page showed the same game as two unrelated things. This is the reference's
 * card at list scale, and the landing block is now the same component.
 *
 * NOT A NESTED-ANCHOR CARD. The whole card is not one big `<a>`, because it
 * contains a share link and a map link, and an `<a>` inside an `<a>` is invalid
 * HTML that every browser un-nests differently. Instead the title is the link
 * and it carries a `::after` overlay that covers the card, with the two real
 * links raised above it. Clicking anywhere still opens the game; the other two
 * links still work; the markup stays valid and the tab order stays sane.
 *
 * ESCAPING: `venue` and every nickname are free text rendered as JSX children,
 * which React escapes. The share URL is built by `whatsAppShareUrl`, which
 * encodes the finished message exactly once.
 */
export function GameCard({
  game,
  bookedCount,
  roster = [],
  venueRow = null,
  shareUrl,
  onWaitlist = false,
}: GameCardProps) {
  const urgency = gameUrgency(bookedCount, game.capacity);
  const filled = Math.min(bookedCount, game.capacity);
  const when = formatGameDateTime(game.starts_at);

  return (
    <article
      data-testid="game-card"
      data-urgency={urgency}
      className="group relative isolate flex flex-wrap overflow-hidden rounded-panel border border-hairline-volt bg-surface-panel transition-colors hover:border-hairline-volt-strong"
    >
      {/* LEFT — when, what, where, and the traced map. */}
      <div className="min-w-[280px] flex-1 border-b border-hairline-soft sm:border-b-0 sm:border-r">
        <div className="px-5 pb-4 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
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

          {/* The card's link. `before:` covers the whole card — see the note. */}
          <h3 className="mt-[10px] font-condensed text-[22px] font-bold leading-tight text-white">
            <Link
              href={`/game/${game.id}`}
              className="text-white no-underline before:absolute before:inset-0 before:z-0 before:content-['']"
            >
              {game.venue}
            </Link>
          </h3>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-[12px] text-muted">
              {formatCzk(game.price_czk)}
            </span>
            {onWaitlist && (
              <span
                data-testid="on-waitlist-badge"
                className="rounded-chip border border-hairline-volt bg-volt/[.08] px-2 py-[2px] font-mono text-[9px] uppercase tracking-eyebrow text-volt"
              >
                {strings.games.onWaitlistBadge}
              </span>
            )}
          </div>
        </div>

        <VenueMapPanel venue={game.venue} venueRow={venueRow} className="h-[150px]" />
      </div>

      {/* RIGHT — the count, the notches, the lineup, the way in. */}
      <div className="flex min-w-[260px] flex-1 flex-col px-5 py-5">
        <div className="mb-[10px] flex items-baseline justify-between gap-3">
          <span
            data-testid="urgency-label"
            className={`font-mono text-[10px] uppercase tracking-[2px] ${
              urgency === "full" ? "text-faint" : "text-volt-dim"
            }`}
          >
            {urgencyLabel(urgency)}
          </span>
          <span className="font-mono text-[18px] font-bold text-white">
            {String(filled).padStart(2, "0")}/{game.capacity}
          </span>
        </div>

        <CapacityBar bookedCount={bookedCount} capacity={game.capacity} size="slim" />

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 pl-2">
          <AvatarRow names={roster} max={8} size="slim" />
          <span
            data-testid="spots-left"
            className={`text-[12px] ${urgency === "full" ? "text-faint" : "text-muted-dim"}`}
          >
            {urgency === "full" ? (
              strings.games.fullNotice
            ) : (
              <b className="text-volt">{spotsLeftLabel(bookedCount, game.capacity)}</b>
            )}
          </span>
        </div>

        <div className="flex-1" />

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link
            href={`/game/${game.id}`}
            className={`relative z-[1] flex-1 rounded-cta px-4 py-3 text-center font-condensed text-[16px] font-extrabold uppercase tracking-wide no-underline ${
              urgency === "full"
                ? "border border-hairline-volt bg-transparent text-volt"
                : "bg-volt text-surface"
            }`}
          >
            {urgency === "full" ? strings.games.joinWaitlist : strings.booking.claimSpot}
          </Link>

          {shareUrl && (
            /* Raised above the title's card-covering overlay, so it is a real
               link rather than a hole in the card's click target. */
            <span className="relative z-[1]">
              <ShareButton venue={game.venue} when={when} url={shareUrl} size="slim" />
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
