import Link from "next/link";
import { availableTransitions, listAllGames } from "@/lib/admin/queries";
import { formatCzk, formatGameDateTime } from "@/lib/format";
import { ExportCsvLink } from "@/components/admin/ExportCsvLink";
import { strings } from "@/lib/strings";

export const metadata = { title: strings.admin.gamesTitle };

export const dynamic = "force-dynamic";

/**
 * Every game, drafts and cancelled ones included.
 *
 * Read through the service-role client (see `lib/admin/queries.ts`): the public
 * RLS policy hides drafts from every `authenticated` session, admins included,
 * and it is not widened for admins on purpose.
 */
export default async function AdminGamesPage() {
  const games = await listAllGames();

  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 font-display text-page-title uppercase tracking-wide text-white">
          {strings.admin.gamesTitle}
        </h2>
        <div className="flex items-center gap-2">
          <ExportCsvLink href="/admin/games/export" testId="export-games" />
          <Link
            href="/admin/games/new"
            data-testid="new-game"
            className="inline-flex min-h-11 items-center rounded-control bg-volt px-5 text-[15px] font-extrabold uppercase tracking-wide text-surface no-underline"
          >
            {strings.admin.newGame}
          </Link>
        </div>
      </div>

      {games.length === 0 ? (
        <p className="mt-8 text-[12px] tracking-[1px] text-faint">
          {strings.admin.gamesEmpty}
        </p>
      ) : (
        <ul className="mt-6 list-none space-y-3 p-0">
          {games.map((game) => {
            const { canEdit } = availableTransitions(game.status);
            return (
              <li
                key={game.id}
                data-testid="admin-game-row"
                data-status={game.status}
                /*
                  VENUE AND COUNT ON ONE ROW, everything else beneath (admin
                  restyle). The reference draws a fixture as a bold venue with
                  the occupancy hard right and a quiet detail line under both —
                  which is exactly what an organizer scans a list of games for:
                  where, and how full.
                */
                className="lifted flex flex-col gap-3 rounded-card px-4 py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  {/* `venue` is admin-supplied free text; JSX escapes it. */}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-body-lg font-bold text-white">
                      {game.venue}
                    </div>
                    <div className="mt-[2px] text-small text-muted">
                      {formatGameDateTime(game.starts_at)} · {formatCzk(game.price_czk)}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="text-body-lg font-bold text-volt">
                      {game.activeCount}/{game.capacity}
                    </div>
                    <div
                      data-testid="admin-game-status"
                      className="mt-[2px] text-small text-volt-dim"
                    >
                      {strings.admin.status[game.status]}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-small">
                  {/* `Booked x/y` USED TO SIT HERE TOO. The occupancy moved to
                      the top-right of the row above, so printing it again three
                      lines down was the same fact twice — which reads as two
                      different numbers that happen to agree. */}
                  {/* Waitlist depth — the expansion-trigger sensor (REQ-UI-018). */}
                  <span
                    data-testid="admin-waitlist-depth"
                    className={game.waitlistCount > 0 ? "text-volt" : "text-faint"}
                  >
                    {strings.admin.waitlistLabel} {game.waitlistCount}
                  </span>
                </div>

                <div className="flex gap-3">
                  <Link
                    href={`/admin/games/${game.id}`}
                    className="text-[11px] uppercase tracking-eyebrow text-volt no-underline"
                  >
                    {strings.admin.manageGame}
                  </Link>
                  {canEdit && (
                    <Link
                      href={`/admin/games/${game.id}/edit`}
                      className="text-[11px] uppercase tracking-eyebrow text-muted no-underline"
                    >
                      {strings.admin.editGame}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
