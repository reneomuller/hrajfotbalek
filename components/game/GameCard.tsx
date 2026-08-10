import Link from "next/link";
import { AvatarRow } from "@/components/game/AvatarRow";
import { CapacityBar } from "@/components/game/CapacityBar";
import { SpotsLeft } from "@/components/game/SpotsLeft";
import { formatGameDate, formatTime } from "@/lib/format";
import { getStrings } from "@/lib/i18n/server";
import type { RosterAvatar } from "@/lib/games/queries";
import type { Database } from "@/lib/types/database";

type GameRowData = Database["public"]["Tables"]["games"]["Row"];

export type GameCardGame = Pick<
  GameRowData,
  "id" | "venue" | "starts_at" | "capacity" | "format" | "surface" | "duration_minutes"
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
      {/*
        THE ANATOMY, in the owner's order (2026-08-10, final):
        venue, day + time, format + surface, capacity bar, spots, faces.

        THE BAR IS RECOVERED FROM `1a42888` ("Phase 15a: the list stops being
        a stack of posters"), where `GameRow` carried
        `<CapacityBar size="slim">`. Ruling D took it off the canonical card on
        the reasoning that a row of grey segments inside a populated card is
        indistinguishable from a skeleton (§2.10); the owner reverses that. It
        is the same component the detail's availability card has used
        throughout, so the two cannot disagree about how full a game is.

        ONE SEGMENT PER SPOT — `capacitySegments` returns an array the length
        of `capacity`, so a 12-spot game draws twelve. Unconditional: an empty
        game draws twelve unfilled.
      */}
      <span data-testid="card-venue" className="block truncate text-body-lg font-semibold text-bone">
        {game.venue}
      </span>

      {/*
        DAY AND TIME. The day was missing — a card that says only `12:30`
        makes a reader carry the day heading in their head while they scroll,
        and on home there is no heading at all.
      */}
      <p data-testid="card-when" className="mt-1 mb-0 text-small text-muted">
        {`${formatGameDate(game.starts_at)} • ${formatTime(game.starts_at)}`}
      </p>

      {/*
        FORMAT AND SURFACE. The surface was missing from the card entirely and
        is a real decision input — turf and indoor are different games. Both
        are omitted when the organizer recorded neither, rather than printing
        a bare separator.
      */}
      {(game.format || game.surface) && (
        <p data-testid="card-format" className="mt-1 mb-0 text-small text-muted">
          {[game.format, game.surface ? t.games.surface[game.surface] : null]
            .filter(Boolean)
            .join(" • ")}
        </p>
      )}

      <div className="mt-3">
        <CapacityBar bookedCount={bookedCount} capacity={game.capacity} size="slim" />
      </div>

      <div className="mt-2">
        <span data-testid="row-spots">
          <SpotsLeft bookedCount={bookedCount} capacity={game.capacity} />
        </span>
      </div>

      {/* The faces still disappear at zero (§2.1) — a ring drawn around
          nobody is a question. The bar above already says the game is empty. */}
      {roster.length > 0 && (
        <div className="mt-3">
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
