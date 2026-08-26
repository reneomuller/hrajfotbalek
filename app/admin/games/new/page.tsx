import Link from "next/link";
import { GameForm } from "@/components/admin/GameForm";
import {
  listVenues,
} from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { appCapabilities } from "@/lib/db/capabilities";
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
export default async function NewGamePage({
  searchParams,
}: {
  /*
   * ~~`?venue=new` opened the form on the new-venue branch.~~ REMOVED (round
   * 14, item 2): venues are created at `/admin/venues` and this form only
   * PICKS one. The prop stays because the route still accepts search params;
   * nothing reads them.
   */
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  void searchParams;
  // The admin's own nickname pre-fills the organizer field (REQ-GAME-001).
  // `requireAdmin()` is already run by the admin layout; calling it here is how
  // the page gets the player row, not a second gate.
  const [admin, venues, capabilities] = await Promise.all([
    requireAdmin(),
    listVenues(),
    appCapabilities(),
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
        ~~UNFINISHED GAMES (round 9, item 7) — a list of drafts, here because
        this is where somebody about to make a game is standing.~~ REMOVED
        (round 14, item 1).

        THE DRAFT CONCEPT IS GONE, not just its list. Creating a game has
        published it since round 9, so a draft could only be one made before
        that change or one whose publish call failed — and this panel existed
        to keep those reachable. It rendered nothing in the normal case, which
        is the case that is now the only case.

        Rows that still exist in the database are the owner's to delete:
        `docs/ops/delete-draft-games.sql`, handed over rather than run.
      */}

      <GameForm
        action={createGameAction}
        venues={venues}
        defaultOrganizerName={admin.nickname}
        canSetLanguage={capabilities.gameLanguage}
            canSetTelegram={capabilities.organizerTelegram}
      />
    </>
  );
}
