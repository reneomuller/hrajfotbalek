import Link from "next/link";
import { CapacityBar } from "@/components/game/CapacityBar";
import { FormatChips } from "@/components/game/FormatChips";
import { SkillBadges } from "@/components/game/SkillBadges";
import { formatCzk, formatTimeSpan } from "@/lib/format";
import { gameEndsAt } from "@/lib/games/duration";
import { gameUrgency, spotsLeftLabel } from "@/lib/games/urgency";
import { getStrings } from "@/lib/i18n/server";
import type { Database } from "@/lib/types/database";

type GameRowData = Database["public"]["Tables"]["games"]["Row"];

export type GameRowGame = Pick<
  GameRowData,
  | "id"
  | "venue"
  | "starts_at"
  | "capacity"
  | "price_czk"
  | "format"
  | "surface"
  | "duration_minutes"
  | "allowed_skill_levels"
  | "subs_per_team"
>;

/**
 * One game, at list density (§5.5, v1.1.4).
 *
 * NO VENUE PHOTO, AND THAT IS THE POINT. v1.1.2 hoped swapping the traced map
 * for a photo would improve density; it does the opposite — the photo belongs
 * on the detail page, where someone deciding about ONE game benefits from
 * seeing the pitch. On a list it is a scroll cost per row, and the criterion
 * this row exists to meet is "well more than three games visible at Pixel-7
 * width", verified by a spec rather than by eye.
 *
 * "VIEW GAME", NEVER "CLAIM" (§5.6a). The claim button exists once, on the
 * detail, and it is the state-aware one. A CTA that books from a list is a CTA
 * that books the wrong game — and it duplicated the already-booked logic
 * across three surfaces, which is three places for it to be got wrong.
 *
 * The whole row is one link, and it can be: unlike the card, there is no share
 * button and no map link inside it, so there is no nested anchor to work
 * around.
 *
 * ESCAPING: `venue` is admin-supplied free text rendered as a JSX child, which
 * React escapes.
 */
export async function GameRow({
  game,
  bookedCount,
  onWaitlist = false,
}: {
  game: GameRowGame;
  bookedCount: number;
  /** True when the signed-in player holds a waitlist row on this game. */
  onWaitlist?: boolean;
}) {
  const t = await getStrings();
  const urgency = gameUrgency(bookedCount, game.capacity);
  const isFull = urgency === "full";

  return (
    <Link
      href={`/game/${game.id}`}
      data-testid="game-row"
      data-urgency={urgency}
      /*
        py-[10px] rather than py-3, and the internal gaps below are 6px rather
        than 8. This row is the density criterion (§5.5) and the numbers are
        load-bearing: with the pass panel above it, py-3 put the fifth row two
        pixels below the fold at Pixel-7 height. The spec counts rows fully
        inside the viewport, so "nearly" does not count.
      */
      className="block rounded-card border border-hairline-volt bg-surface-panel px-4 py-[10px] no-underline transition-colors hover:border-hairline-volt-strong"
    >
      {/* Line one — when, where, and how full. */}
      <div className="flex items-baseline justify-between gap-3">
        <span
          data-testid="row-time-span"
          className="font-mono text-[13px] font-bold tracking-[1px] text-volt"
        >
          {formatTimeSpan(
            game.starts_at,
            gameEndsAt(game.starts_at, game.duration_minutes),
          )}
        </span>
        <span
          data-testid="row-spots"
          className={`font-mono text-[11px] ${isFull ? "text-faint" : "text-muted"}`}
        >
          {isFull ? t.games.full : spotsLeftLabel(bookedCount, game.capacity, t)}
        </span>
      </div>

      <div className="mt-[2px] flex items-baseline justify-between gap-3">
        <span className="truncate font-condensed text-[17px] font-bold leading-tight text-white">
          {game.venue}
        </span>
        <span className="shrink-0 font-mono text-[12px] text-muted">
          {formatCzk(game.price_czk)}
        </span>
      </div>

      {/* Line two — the fullness bar, at row scale. */}
      <div className="mt-[6px]">
        <CapacityBar bookedCount={bookedCount} capacity={game.capacity} size="slim" />
      </div>

      {/* Line three — what kind of game it is. Chips wrap rather than
          truncate, because a wrapped surface label is legible and a clipped
          one is a puzzle. */}
      <div className="mt-[6px] flex flex-wrap items-center gap-2">
        <FormatChips
          format={game.format}
          surface={game.surface}
          subsPerTeam={game.subs_per_team}
          size="slim"
        />
        {/* Only when restricted (REQ-GAME-020). */}
        <SkillBadges levels={game.allowed_skill_levels} size="slim" />
        {onWaitlist && (
          <span
            data-testid="on-waitlist-badge"
            className="rounded-chip border border-hairline-volt bg-volt/[.08] px-2 py-[2px] font-mono text-[9px] uppercase tracking-eyebrow text-volt"
          >
            {t.games.onWaitlistBadge}
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] uppercase tracking-eyebrow text-volt-dim">
          {t.games.viewGame} →
        </span>
      </div>
    </Link>
  );
}
