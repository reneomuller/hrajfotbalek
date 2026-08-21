import Link from "next/link";
import { formatGameDateTime } from "@/lib/format";
import { getStrings } from "@/lib/i18n/server";
import type { GameCardGame } from "@/components/game/GameCard";

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
 * ~~REVERSED 2026-08-20 (round 8, item 9): IT IS THE MATCH CARD. A pointer to
 * a game should look like that game, and a private layout above a column of
 * canonical cards is "the same game drawn three ways in one product".~~
 *
 * **REVERSED AGAIN, ROUND 13 ITEM 17: IT IS A BANNER.**
 *
 * Round 8's argument was about DRIFT — a bespoke layout that would slowly stop
 * matching the card beneath it. That argument was right and this does not
 * revive the thing it was aimed at: what follows is not a private copy of a
 * card's structure, it is four facts in a row.
 *
 * What round 8 did not weigh is COST. A full card here is a photograph, a
 * fade, badges, a capacity bar and an avatar stack — roughly 240px — spent
 * telling a player something they already know, directly above the list they
 * came to read. The owner asked for the Game Pass promo's dimensions, and
 * `PassPanel` is the shape: one row, `px-5 py-4`, a bordered volt tint.
 *
 * THE THREE FACTS ARE THE ITEM'S: title, time, status. "Status" here is how
 * full it is, which is the only thing about a game you are already in that can
 * still change.
 *
 * `PassPanel`'S GEOMETRY IS COPIED, NOT IMPORTED, and that is the honest
 * trade: they are two different destinations with two different tints, and
 * sharing a component to keep two paddings equal would couple them for the
 * sake of eight characters.
 */
export async function NextGameStrip({
  game,
  bookedCount,
  pitchName,
}: {
  game: GameCardGame;
  bookedCount: number;
  /*
   * ~~`roster` and `supabaseUrl` — the avatar stack the list card carries.~~
   * A banner has no faces on it (round 13, item 17), and props a component
   * accepts and ignores are props somebody will keep passing.
   */
  pitchName?: string | null;
}) {
  const t = await getStrings();
  const spotsLeft = Math.max(0, game.capacity - bookedCount);

  return (
    <section data-testid="next-game-strip">
      <h2 className="m-0 mb-2 text-eyebrow font-semibold uppercase text-volt">
        {t.games.nextGameStrip}
      </h2>

      <Link
        href={`/game/${game.id}`}
        data-testid="next-game-banner"
        className="flex items-center justify-between gap-3 rounded-card border border-hairline-volt bg-volt/[.10] px-5 py-4 no-underline transition-colors hover:bg-volt/[.16]"
      >
        <span className="min-w-0">
          <span className="block truncate text-body-lg font-bold text-white">
            {pitchName ? `${game.venue} · ${pitchName}` : game.venue}
          </span>
          <span className="mt-[2px] block truncate text-small text-muted">
            {formatGameDateTime(game.starts_at)}
          </span>
        </span>

        {/*
          HOW FULL, which is the only thing about a game you are already in
          that can still change — and the one number the list card spends a
          capacity bar on.
        */}
        <span className="shrink-0 text-right">
          <span className="block text-body font-bold text-volt">
            {bookedCount} / {game.capacity}
          </span>
          <span className="block text-[12px] text-muted">
            {/*
              `spotsLeft` / `spotLeft` are BARE NOUNS in the table — the count
              is interpolated by the caller, which is how the list card does
              it too. A `{count}` replace here would have printed the literal.
            */}
            {spotsLeft === 0
              ? t.games.full
              : `${spotsLeft} ${spotsLeft === 1 ? t.games.spotLeft : t.games.spotsLeft}`}
          </span>
        </span>
      </Link>
    </section>
  );
}
