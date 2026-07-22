import Link from "next/link";
import { CapacityBar } from "@/components/game/CapacityBar";
import { formatGameDateTime } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { Database } from "@/lib/types/database";

type GameRow = Database["public"]["Tables"]["games"]["Row"];

/**
 * "Your next game" — the strip above the list, for a player who already holds
 * a booking.
 *
 * WHY IT SITS ABOVE THE LIST. A signed-in player arriving at `/games` almost
 * always has one of two questions: "what am I already in?" or "what else is
 * on?". The list only answers the second, and the first was previously a trip
 * through `/account`. This answers it in one line without displacing the list.
 *
 * It renders only when there IS a next game — no empty state, no placeholder.
 * A player with nothing booked is not missing anything here; they are being
 * shown the list, which is the right answer for them.
 *
 * Deliberately NOT a match card. It is a pointer to something already settled,
 * so it carries the minimum that identifies the game plus how full it is — the
 * one number that changes after you book and that you might want to watch.
 */
export function NextGameStrip({
  game,
  bookedCount,
}: {
  game: Pick<GameRow, "id" | "venue" | "starts_at" | "capacity">;
  bookedCount: number;
}) {
  return (
    <Link
      href={`/game/${game.id}`}
      data-testid="next-game-strip"
      className="block rounded-card border border-hairline-volt bg-surface-card-strong px-5 py-4 no-underline transition-colors hover:border-hairline-volt-strong"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-mono text-[10px] uppercase tracking-eyebrow text-volt-dim">
          {strings.games.nextGameStrip}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-eyebrow text-volt">
          {strings.games.nextGameStripCta}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        {/* `venue` is admin-supplied free text; JSX escapes it. */}
        <span className="font-condensed text-[20px] font-bold text-white">
          {game.venue}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[1px] text-chalk">
          {formatGameDateTime(game.starts_at)}
        </span>
      </div>

      <div className="mt-3">
        <CapacityBar bookedCount={bookedCount} capacity={game.capacity} size="slim" />
      </div>
    </Link>
  );
}
