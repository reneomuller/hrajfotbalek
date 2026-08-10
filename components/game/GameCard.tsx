import Link from "next/link";
import { AvatarRow } from "@/components/game/AvatarRow";
import { SpotsLeft } from "@/components/game/SpotsLeft";
import { formatTime } from "@/lib/format";
import { resolveDurationMinutes } from "@/lib/games/duration";
import { getStrings } from "@/lib/i18n/server";
import type { RosterAvatar } from "@/lib/games/queries";
import type { Database } from "@/lib/types/database";

type GameRowData = Database["public"]["Tables"]["games"]["Row"];

export type GameCardGame = Pick<
  GameRowData,
  "id" | "venue" | "starts_at" | "capacity" | "format" | "duration_minutes"
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
        THE DOTTED LINE IS THE SINGLE OCCUPANCY STATEMENT, with the lineup
        beneath it (density ruling, 2026-08-10).

        The card said it twice: a `10 spots left` row of its own above the
        rule, and `2 / 12 players` below it. Two sentences about the same fact
        cost a row the fold could not spare — the card had reached 171px and
        two whole cards above the fold, from five in v1.1.4.

        MERGED RATHER THAN DROPPED. The spots figure keeps its colour ladder
        and stays the card's ONE accent (ruling D); the raw count joins it
        after a middot as the smaller, uncoloured half. Someone deciding reads
        the first; someone judging whether a game will actually fill reads the
        second.

        THE FRACTION IS NOT COPY. `2/12` is two numbers and a solidus, so it is
        built here rather than added to the string table — a "{booked}/{capacity}"
        entry would demand a Czech and a Russian translation of punctuation,
        and the i18n walk would flag all three as identical.

        The AVATARS still disappear at zero (§2.1) while the line does not: a
        count of nobody is a fact and an invitation, a ring around nobody is a
        question.
      */}
      <div className="mt-3 border-t border-dotted border-hairline-strong pt-3">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span data-testid="row-spots">
            <SpotsLeft bookedCount={bookedCount} capacity={game.capacity} />
          </span>
          <span data-testid="card-players-count" className="text-small text-muted">
            {`· ${Math.min(bookedCount, game.capacity)}/${game.capacity}`}
          </span>
        </div>

        {roster.length > 0 && (
          <div className="mt-2">
            <AvatarRow players={roster} max={3} size="card" supabaseUrl={supabaseUrl} />
          </div>
        )}
      </div>
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
