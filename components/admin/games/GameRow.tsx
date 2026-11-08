import Link from "next/link";
import { SignedCzk } from "@/components/admin/ui/Money";
import { SeatBar } from "@/components/admin/ui/SeatBar";
import { BreakEvenLine } from "@/components/admin/games/BreakEvenLine";
import { StatusChip } from "@/components/admin/games/StatusChip";
import type { GameEconomics } from "@/lib/admin/economics";
import { breakEvenOutlook } from "@/lib/admin/games/breakEven";
import type { GameTab } from "@/lib/admin/games/tabs";
import type { AdminGameRow } from "@/lib/admin/queries";
import { formatCzk, formatGameDateTime } from "@/lib/format";
import { strings } from "@/lib/strings";

const hub = strings.admin.gamesHub;

/**
 * One game on the admin list (round 42, the admin rebuild).
 *
 * ~~Where, when, how full, what state — one line, 12px grey for everything but
 * the venue.~~ STILL ONE ROW, AND STILL THE WHOLE ROW IS THE LINK (round 13,
 * item 21), but the row now answers the question the owner asked of it: is
 * this game paying for its pitch. A seat bar split by how each seat was paid,
 * with the break-even line on it; under an upcoming game, how many seats it
 * still needs; under a played one, what it made.
 *
 * On a phone: venue and time beside the count and the status, the bar under
 * both. From `md` it is one line of four columns, so the list reads down the
 * page like a table without being one — a row that navigates is a link, and a
 * table row cannot be.
 *
 * THE ORDINAL is a rendered index counted from the oldest row on the tab
 * (round 18 item 5, round 19 item 3) — `e2e/round18-surfaces.spec.ts` checks
 * it runs n..1 down the page with the oldest kick-off at 1.
 */
export function GameRow({
  game,
  ordinal,
  tab,
  economics,
  reason,
}: {
  game: AdminGameRow;
  ordinal: number;
  tab: GameTab;
  /** Null before the pitch-cost migration, and on the Cancelled tab. */
  economics: GameEconomics | null;
  /** The recorded cancel reason, on the Cancelled tab. */
  reason: string | null;
}) {
  const showProfit = tab === "played" && economics !== null && economics.profitCzk !== null;
  const lines = [
    tab === "upcoming" && economics && (
      <BreakEvenLine key="break-even" outlook={breakEvenOutlook(economics)} />
    ),
    showProfit && (
      <span key="profit" className="text-muted">
        {hub.profit} <SignedCzk amount={economics.profitCzk ?? 0} testId="admin-game-profit" className="font-semibold" />
      </span>
    ),
    tab !== "cancelled" && game.unpaidCount > 0 && (
      <span key="unpaid" data-testid="admin-game-unpaid" className="text-warn">
        {hub.unpaidOnRow.replace("{n}", String(game.unpaidCount))}
      </span>
    ),
    /* The waitlist depth is the expansion-trigger sensor (REQ-UI-018), and it
       renders only WHEN THERE IS A QUEUE — a sensor, not a column of zeroes. */
    game.waitlistCount > 0 && (
      <span key="waiting" data-testid="admin-waitlist-depth" className="text-volt">
        {strings.admin.waitlistLabel} {game.waitlistCount}
      </span>
    ),
    tab === "cancelled" && (
      // Admin-typed free text, escaped by JSX.
      <span key="reason" data-testid="admin-game-cancel-reason" className="min-w-0 italic text-muted">
        {reason ?? hub.noReason}
      </span>
    ),
  ].filter(Boolean);

  const showBar = tab !== "cancelled" && economics !== null;

  return (
    <li
      data-testid="admin-game-row"
      /* Round 35 — a spec finds THIS game's row rather than whichever one the
         sort put on top. */
      data-game-id={game.id}
      data-status={game.status}
      /* Round 19 item 3 — lets a spec check the numbering DIRECTION against the
         dates rather than against the row order. */
      data-starts-at={game.starts_at}
      data-tab={tab}
      className="lifted rounded-card"
    >
      <Link
        href={`/admin/games/${game.id}`}
        data-testid="admin-manage-game"
        className="pressable grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-card px-4 py-3 no-underline md:grid-cols-[28px_minmax(0,1.25fr)_minmax(0,1fr)_112px] md:gap-x-5 md:py-4"
      >
        {/* `aria-hidden`: the row announces its venue and time; a number read
            out before each one is noise. */}
        <span
          aria-hidden
          data-testid="admin-game-ordinal"
          data-ordinal={ordinal}
          className="text-right text-[13px] tabular-nums text-faint"
        >
          {ordinal}
        </span>

        <span className="min-w-0">
          {/* `venue` is admin-supplied free text; JSX escapes it. */}
          <span className="block truncate text-body font-semibold text-white">{game.venue}</span>
          <span className="mt-[1px] block truncate text-[12px] tabular-nums text-muted">
            {formatGameDateTime(game.starts_at)} · {formatCzk(game.price_czk)}
          </span>
        </span>

        <span className="flex flex-col items-end gap-[6px] md:col-start-4 md:row-start-1">
          <span data-testid="admin-game-capacity" className="text-body font-bold tabular-nums text-volt">
            {game.activeCount}/{game.capacity}
          </span>
          <StatusChip status={game.status} testId="admin-game-status" />
        </span>

        {(showBar || lines.length > 0) && (
          <span className="col-span-2 col-start-2 min-w-0 md:col-span-1 md:col-start-3 md:row-start-1">
            {showBar && economics && (
              <SeatBar game={economics} seatsTaken={economics.seatsTaken} testId="admin-game-seat-bar" />
            )}
            {lines.length > 0 && (
              <span className={`flex flex-wrap gap-x-3 gap-y-1 text-[12px] ${showBar ? "mt-2" : ""}`}>
                {lines}
              </span>
            )}
          </span>
        )}
      </Link>
    </li>
  );
}
