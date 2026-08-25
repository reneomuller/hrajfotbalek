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
 * ~~Deliberately NOT a match card — a pointer to something already settled.~~
 * ~~Round 8 item 9: IT IS THE MATCH CARD; a pointer to a game should look like
 * that game, and a private layout above a column of canonical cards is "the
 * same game drawn three ways".~~
 * ~~Round 13 item 17: IT IS A BANNER at the Game Pass promo's dimensions — a
 * full card here is ~240px spent telling a player something they already
 * know, directly above the list they came to read.~~
 *
 * **ROUND 14 ITEM 14: IT IS A MY-GAMES ROW.** The owner's correction to item
 * 17, and the fourth treatment this element has had.
 *
 * ITEM 17 WAS RIGHT ABOUT THE SIZE AND WRONG ABOUT THE BORROWED LANGUAGE. The
 * Game Pass promo is a volt-tinted, volt-bordered advertisement — the loudest
 * quiet thing on the page — and dressing a game the player has ALREADY BOOKED
 * in it made a settled fact look like an offer. Two blocks in the same paint,
 * one selling and one confirming.
 *
 * THE PLAYED-GAME ROWS UNDER PROFILE → MY GAMES ARE THE RIGHT PRECEDENT and
 * were there the whole time: a baseline row, a bottom hairline, no card
 * surface, title / time / status. That is exactly this element's content, and
 * it is already how this product draws "a game of yours, stated". Same
 * anatomy, same density, so a player meets one pattern in both places.
 *
 * `PlayerHistory`'S MARKUP IS MATCHED, NOT IMPORTED. Those rows come from a
 * `history.past` shape with an attendance mark; this is one upcoming game with
 * an occupancy. Sharing a component to keep two paddings equal would couple
 * two surfaces that differ in what they are ABOUT.
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
      {/*
        The same heading treatment "My games" gives its two sections, for the
        same reason: this is a titled list of the reader's own games, and there
        it is `text-[17px] font-bold uppercase`.
      */}
      <h2 className="m-0 mb-2 text-[17px] font-bold uppercase tracking-wide text-white">
        {t.games.nextGameStrip}
      </h2>

      {/*
        A CARD YOU CAN SEE IS A CONTROL (round 16, item 8) — the fifth
        treatment, and a correction to the fourth rather than a replacement of
        it.

        ROUND 14 ITEM 14 GOT THE ANATOMY RIGHT and the affordance wrong. Its
        reasoning holds: this is one of the reader's own games stated plainly,
        and the played rows under Profile → My games are how this product
        already draws that. So the CONTENT and the density are unchanged.

        What it inherited from those rows was their flatness — a baseline row
        on a bottom hairline. That is correct in My games, where the whole
        screen is a list of such rows and the pattern teaches itself. Here it
        is one row alone above a column of cards, and a lone flat row reads as
        a caption for the list below it. It was a link the entire time and
        nothing said so; hover is not an affordance on a phone.

        `rounded-card bg-surface` and a chevron: the two things every other
        tappable box on this product has. NOT the full match card — no
        photograph, no badges, no capacity bar — because round 13 item 17 was
        right that ~240px is too much to spend telling somebody what they
        already know.
      */}
      <Link
        href={`/game/${game.id}`}
        data-testid="next-game-row"
        className="game-box flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-card px-4 py-3 no-underline transition-colors hover:bg-surface-raised"
      >
        <span className="flex min-w-0 items-baseline gap-2 text-base font-bold text-white">
          <span className="truncate">
            {pitchName ? `${game.venue} · ${pitchName}` : game.venue}
          </span>
          {/*
            The chevron rides with the TITLE rather than sitting at the far
            right of the box. At 390px the row wraps, and a chevron anchored to
            the row's end lands under the status on a second line, pointing at
            nothing.
          */}
          <span aria-hidden className="shrink-0 text-volt">
            →
          </span>
        </span>
        <span className="text-xs text-white/50">{formatGameDateTime(game.starts_at)}</span>
        {/*
          THE STATUS, in the eyebrow the played rows use for attendance. For a
          game already booked, how full it is is the only thing that can still
          change — and it is volt while there is room, muted once there is not,
          which is the same "nothing to do here" reading the admin rows use.
        */}
        <span
          data-testid="next-game-status"
          className={`text-[11px] uppercase tracking-eyebrow ${
            spotsLeft === 0 ? "text-white/40" : "text-volt"
          }`}
        >
          {spotsLeft === 0
            ? t.games.full
            : `${spotsLeft} ${spotsLeft === 1 ? t.games.spotLeft : t.games.spotsLeft}`}
        </span>
      </Link>
    </section>
  );
}
