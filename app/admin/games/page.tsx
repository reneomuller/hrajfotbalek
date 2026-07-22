import Link from "next/link";
import { availableTransitions, listAllGames } from "@/lib/admin/queries";
import { formatCzk, formatGameDateTime } from "@/lib/format";
import { strings } from "@/lib/strings";

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
        <h2 className="m-0 font-condensed text-[22px] font-bold uppercase tracking-wide text-bone">
          {strings.admin.gamesTitle}
        </h2>
        <Link
          href="/admin/games/new"
          data-testid="new-game"
          className="rounded-cta bg-volt px-5 py-3 font-condensed text-[15px] font-extrabold uppercase tracking-wide text-surface no-underline"
        >
          {strings.admin.newGame}
        </Link>
      </div>

      {games.length === 0 ? (
        <p className="mt-8 font-mono text-[12px] tracking-[1px] text-faint">
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
                className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-hairline bg-surface-card px-5 py-4"
              >
                <div className="min-w-[220px] flex-1">
                  {/* `venue` is admin-supplied free text; JSX escapes it. */}
                  <div className="font-condensed text-[18px] font-bold text-white">
                    {game.venue}
                  </div>
                  <div className="mt-1 font-mono text-[11px] tracking-[1px] text-muted">
                    {formatGameDateTime(game.starts_at)} · {formatCzk(game.price_czk)}
                  </div>
                </div>

                <div className="flex items-center gap-5 font-mono text-[11px] tracking-[1px]">
                  <span data-testid="admin-game-status" className="text-volt-dim">
                    {strings.admin.status[game.status]}
                  </span>
                  <span className="text-muted">
                    {strings.admin.bookedLabel} {game.activeCount}/{game.capacity}
                  </span>
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
                    className="font-mono text-[11px] uppercase tracking-eyebrow text-volt no-underline"
                  >
                    {strings.admin.manageGame}
                  </Link>
                  {canEdit && (
                    <Link
                      href={`/admin/games/${game.id}/edit`}
                      className="font-mono text-[11px] uppercase tracking-eyebrow text-muted no-underline"
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
