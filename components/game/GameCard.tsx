import Link from "next/link";
import { AvatarRow } from "@/components/game/AvatarRow";
import { SpotsLeft } from "@/components/game/SpotsLeft";
import { formatCzk, formatTime } from "@/lib/format";
import { resolveDurationMinutes } from "@/lib/games/duration";
import { getLocale, getStrings } from "@/lib/i18n/server";
import { creditsLabel } from "@/lib/pass/credits";
import { PASS_REFERENCE_PRICE_CZK } from "@/lib/pass/queries";
import type { RosterAvatar } from "@/lib/games/queries";
import type { Database } from "@/lib/types/database";

type GameRowData = Database["public"]["Tables"]["games"]["Row"];

export type GameCardGame = Pick<
  GameRowData,
  "id" | "venue" | "starts_at" | "capacity" | "format" | "duration_minutes" | "price_czk"
>;

/**
 * THE canonical game card (v1.3 §2.1, ruling E).
 *
 * ONE COMPONENT, THREE SURFACES: the games list, home's upcoming preview, and
 * My Games — including My Games' past rows, which use this card at its `past`
 * state rather than a list-row shape of their own. The previous arrangement had
 * a `GameRow` for two of those and a bespoke shape for the third, which is how
 * the same game came to be drawn three ways in one product.
 *
 *   ┌──────────────────────────────────────────┐
 *   │  20:00  60 min                     6v6   │
 *   │  Praha 3 — Pražačka                      │
 *   │  (◐)(◐)(◐)+9            3 spots left     │
 *   └──────────────────────────────────────────┘
 *
 * WHAT RULING E REMOVED, and why each removal is not a loss:
 *
 *   - NO `View game →`. The whole card is the tap target, so a link inside a
 *     link was both redundant and the reason the card could not simply be an
 *     anchor. It is still keyboard-reachable and still openable in a new tab,
 *     because it is a real `<a href>` (§2.0).
 *   - NO CAPACITY BAR (ruling D). A row of grey segments inside a populated
 *     card is indistinguishable from a skeleton — §2.10 names this exact trap.
 *     The avatar stack replaces it and says something the bar could not: WHO is
 *     coming, which is the question a pickup game turns on.
 *   - NO LEVEL BADGE (ruling I). Restriction is a detail-page fact. A badge
 *     that appears on some rows and not others reads as a property of the row
 *     rather than of the game.
 *   - NO SURFACE CHIP. §2.1 draws ONE pill, and it is the format. `TURF` is on
 *     the detail with the rest of the ground truth.
 *
 * TIME AND DURATION ARE TWO ELEMENTS, NOT A SPAN — and this supersedes the
 * span the list carried since Phase 14. §2.1 draws `20:00` at `time`/bone with
 * `60 min` at `small`/muted beside it, and §2.13 names "time, duration, format
 * and spots" as the four things that never truncate. Both readings of the same
 * fact, and v1.3 picks the one where the kick-off is the largest thing on the
 * card. The detail page still renders the range (`InfoCard`, REQ-GAME-007),
 * which is where someone planning an evening around one game is reading.
 *
 * THE SPOTS FIGURE IS THE ONLY COLOURED TEXT ON THE CARD. That is deliberate
 * and it is what makes the ladder legible: on a list of eight cards, eight
 * things competing in volt is no signal at all.
 *
 * ESCAPING: `venue` is admin-supplied free text rendered as a JSX child, which
 * React escapes.
 */
export async function GameCard({
  game,
  bookedCount,
  roster = [],
  supabaseUrl,
  past = false,
}: {
  game: GameCardGame;
  bookedCount: number;
  /** Roster avatars for the stack. Empty renders no stack at all (§2.1). */
  roster?: RosterAvatar[];
  /** Storage origin for avatar photos; absent falls back to initials. */
  supabaseUrl?: string;
  /** The `past` state — 45% opacity, not tappable, not focusable. */
  past?: boolean;
}) {
  const t = await getStrings();
  const locale = await getLocale();

  const body = (
    <>
      {/* Line one — when, how long, and what kind. None of the three ever
          truncates (§2.13); the venue below yields first. */}
      <div className="flex items-baseline gap-2">
        <span data-testid="card-time" className="text-time font-bold text-bone">
          {formatTime(game.starts_at)}
        </span>
        <span data-testid="card-duration" className="text-small text-muted">
          {t.games.durationMin.replace(
            "{n}",
            String(resolveDurationMinutes(game.duration_minutes)),
          )}
        </span>

        {game.format && (
          <span
            data-testid="game-format"
            className="ml-auto shrink-0 rounded-pill bg-surface-raised px-3 py-1 text-small text-muted"
          >
            {game.format}
          </span>
        )}
      </div>

      {/* Line two — where. The one thing on the card allowed to truncate. */}
      <span
        data-testid="card-venue"
        className="mt-2 block truncate text-body-lg font-semibold text-bone"
      >
        {game.venue}
      </span>

      {/* Line three — who is coming, and how much room is left.

          `min-h-7` holds the row's height at the avatar's, so a game nobody
          has claimed yet and a game with nine players are the same card
          height. Without it the first card in a list jumps by 28px the moment
          somebody books, which is a layout shift on a surface the reader is
          mid-scroll through. */}
      {/*
        Line three — what it costs, and how much room is left.

        THE PRICE IS BACK ON THE CARD, reversing v1.2 §5.5. It came off on the
        reasoning that it was identical on every game and therefore
        distinguished nothing — true then, and the flat-150 ruling makes it
        MORE true, not less. What changed is that the price is no longer only
        a price: `150 CZK / 1 credit` is the sentence that tells a reader what
        a credit is worth, on the surface where they are deciding whether a
        pass is worth buying.

        THE SUFFIX RENDERS ONLY AT 150. Any other price is shown bare rather
        than converted — a game at 200 is not "1.3 credits", and inventing
        that arithmetic is exactly the pro-rating the credits ruling says to
        stop and ask about. A card that quietly rounded would be wrong in the
        one place a player checks a number against their wallet.
      */}
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <span data-testid="card-price" className="shrink-0 text-body font-semibold text-bone">
          {formatCzk(game.price_czk)}
          {game.price_czk === PASS_REFERENCE_PRICE_CZK && (
            <span data-testid="card-price-credit" className="ml-1 text-small text-muted">
              {`/ ${creditsLabel(1, locale, t)}`}
            </span>
          )}
        </span>

        <span data-testid="row-spots" className="shrink-0">
          <SpotsLeft bookedCount={bookedCount} capacity={game.capacity} />
        </span>
      </div>

      {/*
        Line four — who is coming, UNDER the count rather than opposite it.

        §2.1 draws the stack and the spots figure on one line, and this
        supersedes that for one reason: the detail's availability card puts
        the faces under its count, and a player who scanned the list on faces
        should meet the same arrangement one tap later. Two surfaces answering
        one question in two layouts is the thing the canonical card exists to
        stop.

        THE COST IS REAL AND IS THE POINT TO WATCH: the card grows by the
        stack's height plus its gap, which comes off an above-the-fold count
        that §2.1's geometry had already spent down to three whole cards. See
        the density spec.

        At zero bookings the row is ABSENT ENTIRELY — not an empty ring and
        not a reserved gap. The spots figure above already says the game is
        open, and a circle drawn around nobody is a question rather than a
        statement.
      */}
      {roster.length > 0 && (
        <div className="mt-2">
          <AvatarRow players={roster} max={3} size="card" supabaseUrl={supabaseUrl} />
        </div>
      )}
    </>
  );

  /*
   * THE PAST STATE IS NOT A LINK, and that is the whole of it: 45% opacity,
   * no press state, and — the part that is easy to miss — NOT FOCUSABLE. A
   * disabled-looking card that a keyboard still lands on is worse than one
   * that looks enabled, because the tab order promises something the pointer
   * has already been told is not there.
   */
  if (past) {
    return (
      <div
        data-testid="game-row"
        data-past="true"
        className="block rounded-card bg-surface p-4 opacity-45"
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      href={`/game/${game.id}`}
      data-testid="game-row"
      data-past="false"
      className="block rounded-card bg-surface p-4 no-underline transition-colors hover:bg-surface-raised"
    >
      {body}
    </Link>
  );
}
