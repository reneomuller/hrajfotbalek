import Link from "next/link";
import { GameForm } from "@/components/admin/GameForm";
import { listPitchNameSuggestions, listVenues } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { strings } from "@/lib/strings";
import { createGameAction } from "../actions";

export const metadata = { title: strings.admin.newGameTitle };

export const dynamic = "force-dynamic";

/**
 * Create a game.
 *
 * ~~The result is always a `draft`: creation and publication are separate
 * admin actions so a half-configured game is never publicly visible, and no
 * code path auto-publishes.~~
 *
 * **CHANGED 2026-08-20 (round 7, item 6): creating a game PUBLISHES it.**
 * There was no half-configured state for the draft step to protect — the form
 * validates every field the RPC requires before submitting, so the draft it
 * produced was always complete and always published by hand a second later. A
 * click that has never once been withheld is not a safety step.
 *
 * The data model is untouched: `game_status` keeps `draft`, `publish_game`
 * keeps its event, and any draft that already exists is still openable and
 * still publishable from its detail page.
 */
export default async function NewGamePage() {
  // The admin's own nickname pre-fills the organizer field (REQ-GAME-001).
  // `requireAdmin()` is already run by the admin layout; calling it here is how
  // the page gets the player row, not a second gate.
  const [admin, venues, pitchNames] = await Promise.all([
    requireAdmin(),
    listVenues(),
    listPitchNameSuggestions(),
  ]);

  return (
    <>
      <Link
        href="/admin/games"
        className="text-[11px] uppercase tracking-eyebrow text-muted no-underline"
      >
        {strings.games.backToGames}
      </Link>

      <h2 className="mt-4 text-[22px] font-bold uppercase tracking-wide text-bone">
        {strings.admin.newGameTitle}
      </h2>

      <GameForm
        action={createGameAction}
        pitchNames={pitchNames}
        venues={venues}
        defaultOrganizerName={admin.nickname}
      />
    </>
  );
}
