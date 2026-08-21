import Link from "next/link";
import { listAllGames } from "@/lib/admin/queries";
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
        <ul className="mt-6 list-none space-y-2 p-0">
          {games.map((game) => {
            // ~~`canEdit` gated the second link.~~ There is one link now
            // (round 13, item 21) and it is available in every status: the
            // game surface it opens is where a played game is settled and a
            // cancelled one is read.
            return (
              <li
                key={game.id}
                data-testid="admin-game-row"
                data-status={game.status}
                /*
                  ~~A card: venue and count on one row, a detail line beneath,
                  a waitlist line beneath that, and a link row at the bottom.~~
                  ONE ROW (round 13, item 20).

                  It was 137px per game. Ten games was fourteen hundred pixels
                  of scrolling to answer "which of these needs me", and every
                  one of those rows carried four separate lines to say what the
                  dashboard says in two.

                  WHAT SURVIVED IS WHAT AN ORGANIZER SCANS FOR: where, when,
                  how full, and what state it is in. The waitlist depth stays
                  because it is the expansion-trigger sensor (REQ-UI-018) and
                  it is the one number on this page that is not on the
                  dashboard — but it only renders WHEN THERE IS A QUEUE, which
                  is the difference between a sensor and a column of zeroes.

                  THE WHOLE ROW IS THE LINK, so the separate "Manage" text link
                  is gone with it (item 21) — a row that navigates does not
                  need a word telling you it navigates.
                */
                className="lifted rounded-card"
              >
                <Link
                  href={`/admin/games/${game.id}`}
                  data-testid="admin-manage-game"
                  className="flex items-center justify-between gap-3 px-4 py-3 no-underline"
                >
                  <span className="min-w-0 flex-1">
                    {/* `venue` is admin-supplied free text; JSX escapes it. */}
                    <span className="block truncate text-body font-semibold text-white">
                      {game.venue}
                    </span>
                    <span className="mt-[1px] block truncate text-[12px] text-muted">
                      {formatGameDateTime(game.starts_at)} · {formatCzk(game.price_czk)}
                      {game.waitlistCount > 0 && (
                        <>
                          {" · "}
                          <span data-testid="admin-waitlist-depth" className="text-volt">
                            {strings.admin.waitlistLabel} {game.waitlistCount}
                          </span>
                        </>
                      )}
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span className="block text-body font-bold text-volt">
                      {game.activeCount}/{game.capacity}
                    </span>
                    <span
                      data-testid="admin-game-status"
                      className="block text-[12px] text-volt-dim"
                    >
                      {strings.admin.status[game.status]}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
