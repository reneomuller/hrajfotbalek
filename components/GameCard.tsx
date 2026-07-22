import Link from "next/link";
import { formatCzk, formatGameDateTime } from "@/lib/format";
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
  /** Renders the larger landing-page treatment rather than the list treatment. */
  featured?: boolean;
}

/**
 * Game summary card — the shared unit between `/games` and the landing
 * next-match block.
 *
 * ESCAPING: `venue` is admin-supplied free text. It is interpolated here as a
 * JSX text child, which React escapes. It must never reach `dangerouslySet
 * InnerHTML`, and the OG `content` and `.ics` render sites (Phase 13) need
 * their own escaping — HTML text escaping does not carry across grammars.
 */
export function GameCard({ game, bookedCount, featured = false }: GameCardProps) {
  const spotsLeft = Math.max(0, game.capacity - bookedCount);
  const isFull = spotsLeft === 0;

  return (
    <Link
      href={`/game/${game.id}`}
      className="group block rounded-card border border-hairline bg-surface-card p-5 no-underline transition-colors hover:border-hairline-volt"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div
          className={`font-condensed font-bold uppercase tracking-wide text-white ${
            featured ? "text-[26px]" : "text-[19px]"
          }`}
        >
          {game.venue}
        </div>
        <div className="shrink-0 font-mono text-[11px] tracking-[1px] text-volt">
          {formatGameDateTime(game.starts_at)}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="font-mono text-[12px] text-muted">
          {formatCzk(game.price_czk)}
        </div>

        {isFull ? (
          <span className="rounded-chip border border-hairline-strong px-[10px] py-1 font-mono text-[10px] uppercase tracking-eyebrow text-faint">
            {strings.games.full}
          </span>
        ) : (
          <span className="rounded-chip border border-hairline-volt bg-volt/[.08] px-[10px] py-1 font-mono text-[10px] uppercase tracking-eyebrow text-volt">
            {spotsLeft}{" "}
            {spotsLeft === 1 ? strings.games.spotLeft : strings.games.spotsLeft}
          </span>
        )}
      </div>
    </Link>
  );
}
