import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelGameButton } from "@/components/admin/CancelGameButton";
import { GameForm } from "@/components/admin/GameForm";
import { availableTransitions, getAdminGame, listVenues } from "@/lib/admin/queries";
import { strings } from "@/lib/strings";
import { updateGameAction } from "../../actions";

export const dynamic = "force-dynamic";

/**
 * Edit a game — and the home of the cancel trigger.
 *
 * Cancel lives beside edit rather than on its own route because it is the last
 * item on the same list of things an organizer does to a game they are
 * changing their mind about. `app/admin/games/[id]/cancel/actions.ts` (Phase
 * 18) is the action behind it; the button was written then and had no mounting
 * surface until now.
 */
export default async function EditGamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [game, venues] = await Promise.all([getAdminGame(id), listVenues()]);

  if (!game) notFound();

  const { canEdit, canCancel } = availableTransitions(game.status);

  return (
    <>
      <Link
        href={`/admin/games/${game.id}`}
        className="font-mono text-[11px] uppercase tracking-eyebrow text-muted no-underline"
      >
        {strings.common.back}
      </Link>

      <h2 className="mt-4 font-condensed text-[22px] font-bold uppercase tracking-wide text-bone">
        {strings.admin.editGameTitle}
      </h2>
      <p className="mt-1 font-mono text-[11px] tracking-[1px] text-muted">
        {game.venue} · {strings.admin.status[game.status]}
      </p>

      {canEdit ? (
        <GameForm action={updateGameAction} venues={venues} game={game} />
      ) : (
        <p className="mt-6 font-mono text-[12px] tracking-[1px] text-faint">
          {strings.admin.invalidTransition}
        </p>
      )}

      {canCancel && (
        <div className="mt-10 border-t border-hairline-chrome pt-6">
          <CancelGameButton gameId={game.id} venue={game.venue} />
        </div>
      )}
    </>
  );
}
