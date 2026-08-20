import Link from "next/link";
import { GameForm } from "@/components/admin/GameForm";
import {
  listDraftGames,
  listPitchNameSuggestions,
  listVenues,
} from "@/lib/admin/queries";
import { formatGameDateTime } from "@/lib/format";
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
  const [admin, venues, pitchNames, drafts] = await Promise.all([
    requireAdmin(),
    listVenues(),
    listPitchNameSuggestions(),
    listDraftGames(),
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

      {/*
        --- UNFINISHED GAMES (round 9, item 7) --------------------------------

        Creating a game publishes it now, so a draft is either one made before
        that change or one whose publish call failed. Neither is a fixture on
        the board, so they left the games list — but they are somebody's
        half-done work and deleting the only view of them would strand it.

        HERE, BECAUSE THIS IS WHERE SOMEBODY ABOUT TO MAKE A GAME IS STANDING.
        The most likely reason to care about a half-finished game is that you
        are about to create the game it was going to be.

        IT DISAPPEARS WHEN THERE ARE NONE, which is the normal state now and
        the state this list is trying to reach. An empty "no unfinished games"
        panel would be permanent furniture advertising a state that no longer
        occurs.

        EACH ONE OPENS ITS GAME PAGE, where the edit form is already prefilled
        with its values and Publish and Cancel are both there — rather than
        rebuilding either control here.
      */}
      {drafts.length > 0 && (
        <section data-testid="unfinished-games" className="lifted mb-8 rounded-card p-5">
          <h3 className="m-0 text-eyebrow font-semibold uppercase text-volt">
            {strings.admin.unfinishedTitle}
          </h3>
          <p className="m-0 mt-2 text-small text-muted">{strings.admin.unfinishedLede}</p>
          <ul className="m-0 mt-3 list-none p-0">
            {drafts.map((draft) => (
              <li
                key={draft.id}
                className="border-b border-hairline last:border-b-0"
              >
                <Link
                  href={`/admin/games/${draft.id}`}
                  data-testid="unfinished-game"
                  className="flex items-center justify-between gap-3 py-3 no-underline"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-body font-semibold text-white">
                      {draft.venue}
                    </span>
                    <span className="block truncate text-small text-muted">
                      {formatGameDateTime(draft.starts_at)}
                    </span>
                  </span>
                  <span className="shrink-0 text-small font-semibold text-volt">
                    {strings.admin.unfinishedOpen}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <GameForm
        action={createGameAction}
        pitchNames={pitchNames}
        venues={venues}
        defaultOrganizerName={admin.nickname}
      />
    </>
  );
}
