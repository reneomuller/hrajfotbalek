import Link from "next/link";
import type { AdminPlayerGameRow } from "@/lib/admin/queries";
import { formatGameDateTime } from "@/lib/format";
import { strings } from "@/lib/strings";

const hub = strings.admin.playersHub;

/** Where this booking stands: played, on now, still ahead, or not held. */
function stateOf(row: AdminPlayerGameRow): { label: string; tone: string } {
  const held = row.status === "reserved" || row.status === "confirmed";
  if (!held) return { label: strings.admin.status.cancelled, tone: "border-hairline-strong text-faint" };
  if (row.finished) return { label: strings.admin.status.played, tone: "border-hairline-volt text-volt" };
  if (row.live) return { label: strings.games.playingNow, tone: "border-warn text-warn" };
  return { label: hub.gameBooked, tone: "border-hairline-strong text-bone" };
}

/**
 * One game in a player's history (the admin player page).
 *
 * ~~With the no-show control~~ — present / no-show is gone (the owner,
 * 2026-11-09: "let's remove the 'present' and 'no-show' function from the web
 * completely"). The row says where the booking stands and links to the game.
 * It was `PlayerAttendanceRow` until then.
 */
export function PlayerGameRow({ row }: { row: AdminPlayerGameRow }) {
  const state = stateOf(row);
  return (
    <li
      data-testid="player-game-row"
      data-status={row.status}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline py-3 first:border-t-0 first:pt-0"
    >
      <div className="min-w-[180px] flex-1">
        <Link
          href={`/admin/games/${row.gameId}`}
          className="text-body font-bold text-white no-underline transition-colors hover:text-volt"
        >
          {row.venue}
        </Link>
        <div className="text-[12px] tabular-nums text-muted">
          {row.startsAt ? formatGameDateTime(row.startsAt) : "—"}
        </div>
      </div>
      <span
        data-testid="player-game-state"
        className={`shrink-0 rounded-pill border px-2 py-[2px] text-[9px] uppercase leading-normal tracking-eyebrow ${state.tone}`}
      >
        {state.label}
      </span>
    </li>
  );
}
