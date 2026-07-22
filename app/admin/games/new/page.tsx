import Link from "next/link";
import { GameForm } from "@/components/admin/GameForm";
import { listVenues } from "@/lib/admin/queries";
import { strings } from "@/lib/strings";
import { createGameAction } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Create a game.
 *
 * The result is always a `draft`: creation and publication are separate admin
 * actions so a half-configured game is never publicly visible, and no code
 * path auto-publishes.
 */
export default async function NewGamePage() {
  const venues = await listVenues();

  return (
    <>
      <Link
        href="/admin/games"
        className="font-mono text-[11px] uppercase tracking-eyebrow text-muted no-underline"
      >
        {strings.games.backToGames}
      </Link>

      <h2 className="mt-4 font-condensed text-[22px] font-bold uppercase tracking-wide text-bone">
        {strings.admin.newGameTitle}
      </h2>

      <GameForm action={createGameAction} venues={venues} />
    </>
  );
}
