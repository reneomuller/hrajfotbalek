import { GameCard } from "@/components/game/GameCard";
import { getStrings } from "@/lib/i18n/server";
import type { GameCardGame } from "@/components/game/GameCard";
import type { RosterAvatar } from "@/lib/games/queries";

/**
 * "Your next game" — above the list, for a player who already holds a booking.
 *
 * WHY IT SITS ABOVE THE LIST. A signed-in player arriving at `/games` almost
 * always has one of two questions: "what am I already in?" or "what else is
 * on?". The list only answers the second, and the first was previously a trip
 * through `/account`. This answers it without displacing the list.
 *
 * It renders only when there IS a next game — no empty state, no placeholder.
 * A player with nothing booked is not missing anything here; they are being
 * shown the list, which is the right answer for them.
 *
 * ~~Deliberately NOT a match card. It is a pointer to something already
 * settled, so it carries the minimum that identifies the game plus how full it
 * is.~~
 *
 * **REVERSED 2026-08-20 (round 8, item 9): IT IS THE MATCH CARD.**
 *
 * The old reasoning treated "already settled" as a reason to draw the same
 * game a different way — a private layout with its own surface, its own type
 * and no photograph, sitting directly above a column of canonical cards. That
 * is the exact defect `GameCard`'s own header calls out: "the same game drawn
 * three ways in one product". A pointer to a game should look like that game.
 *
 * SO THIS IS NOW A LABEL AND A CARD, and the card is the component, not a
 * copy of its structure. Photo, fade, venue, badges, time pill, spots,
 * capacity bar and faces all arrive by construction and cannot drift from the
 * list beneath it, because they ARE the list's card.
 *
 * THE LABEL IS THE ONLY THING THIS FILE DRAWS. `eyebrow` in volt, matching the
 * day headings the list uses further down — so the page reads as one column of
 * grouped cards rather than a widget above a list.
 */
export async function NextGameStrip({
  game,
  bookedCount,
  roster = [],
  supabaseUrl,
  pitchName,
}: {
  game: GameCardGame;
  bookedCount: number;
  /** Same stack the list card carries; empty renders none (§2.1). */
  roster?: RosterAvatar[];
  supabaseUrl?: string;
  pitchName?: string | null;
}) {
  const t = await getStrings();

  return (
    <section data-testid="next-game-strip">
      <h2 className="m-0 mb-2 text-eyebrow font-semibold uppercase text-volt">
        {t.games.nextGameStrip}
      </h2>
      <GameCard
        game={game}
        bookedCount={bookedCount}
        roster={roster}
        supabaseUrl={supabaseUrl}
        pitchName={pitchName}
        /* The reader is already in this game — see `joinCue` on GameCard. */
        joinCue={false}
      />
    </section>
  );
}
