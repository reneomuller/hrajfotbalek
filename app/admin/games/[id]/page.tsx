import Link from "next/link";
import { notFound } from "next/navigation";
import { TransitionButton } from "@/components/admin/TransitionButton";
import { availableTransitions, getAdminGame } from "@/lib/admin/queries";
import { formatCzk, formatGameDateTime } from "@/lib/format";
import { strings } from "@/lib/strings";
import { publishGameAction } from "../actions";

export const dynamic = "force-dynamic";

/**
 * The per-game admin surface: what this game is, and what can be done to it.
 *
 * Phase 21 ships the identity block and the publish transition. Phase 22 adds
 * the roster and the VS-sorted payment list beneath it.
 */
export default async function AdminGamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const game = await getAdminGame(id);
  if (!game) notFound();

  const { canPublish, canEdit } = availableTransitions(game.status);

  return (
    <>
      <Link
        href="/admin/games"
        className="font-mono text-[11px] uppercase tracking-eyebrow text-muted no-underline"
      >
        {strings.games.backToGames}
      </Link>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
        {/* Free text, escaped by JSX. */}
        <h2 className="m-0 font-condensed text-[22px] font-bold uppercase tracking-wide text-white">
          {game.venue}
        </h2>
        <span
          data-testid="admin-game-status"
          className="font-mono text-[11px] uppercase tracking-eyebrow text-volt-dim"
        >
          {strings.admin.status[game.status]}
        </span>
      </div>

      <dl className="mt-4 grid max-w-[420px] grid-cols-[auto_1fr] gap-x-6 gap-y-1 font-mono text-[12px]">
        <dt className="text-muted">{strings.games.startsLabel}</dt>
        <dd className="m-0 text-bone">{formatGameDateTime(game.starts_at)}</dd>
        <dt className="text-muted">{strings.games.capacityLabel}</dt>
        <dd className="m-0 text-bone">
          {game.activeCount}/{game.capacity}
        </dd>
        <dt className="text-muted">{strings.games.priceLabel}</dt>
        <dd className="m-0 text-bone">{formatCzk(game.price_czk)}</dd>
        <dt className="text-muted">{strings.admin.waitlistLabel}</dt>
        <dd data-testid="admin-waitlist-depth" className="m-0 text-bone">
          {game.waitlistCount}
        </dd>
      </dl>

      {game.status === "draft" && (
        <p className="mt-6 rounded-control border border-hairline-strong px-4 py-3 font-mono text-[11px] tracking-[1px] text-faint">
          {strings.admin.draftNotPublic}
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        {canPublish && (
          <TransitionButton
            action={publishGameAction}
            gameId={game.id}
            label={strings.admin.publishGame}
            testId="publish-game"
          />
        )}
        {canEdit && (
          <Link
            href={`/admin/games/${game.id}/edit`}
            className="rounded-cta border border-hairline-strong px-5 py-3 font-condensed text-[15px] font-extrabold uppercase tracking-wide text-bone no-underline"
          >
            {strings.admin.editGame}
          </Link>
        )}
      </div>
    </>
  );
}
