import Link from "next/link";
import { AvatarRow } from "@/components/game/AvatarRow";
import { CapacityBar } from "@/components/game/CapacityBar";
import { CardBadges } from "@/components/game/CardBadges";
import { venueDisplayName } from "@/lib/venues/displayName";
import { SpotsLeft } from "@/components/game/SpotsLeft";
import { formatTime } from "@/lib/format";
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
  pitchName,
  past = false,
}: {
  game: GameCardGame;
  bookedCount: number;
  /** Roster avatars for the stack. Empty renders no stack at all (§2.1). */
  roster?: RosterAvatar[];
  /** Storage origin for avatar photos; absent falls back to initials. */
  supabaseUrl?: string;
  /**
   * The pitch's own name, read live from `venues` (Section 3 item 4). Absent
   * for most games and for any with a null `venue_id`, which renders the venue
   * name alone.
   */
  pitchName?: string | null;
  /** The `past` state — 45% opacity, not tappable, not focusable. */
  past?: boolean;
  /*
   * `now` IS NO LONGER A PROP. Section 3 item 5 took the date off the pill —
   * the day-group heading above the card carries it — so the card no longer
   * decides whether a game is "today" and no longer needs the clock. The
   * relative label lives on in `relativeDayLabel`, used by the headings and by
   * the calendar cells, which is where one implementation now serves both.
   */
}) {

  const body = (
    <>
      {/*
        THE ANATOMY, compressed (rulings 6–8, 2026-08-10):
        venue · [day-time pill | badges] · capacity bar · spots · faces.

        THIN IS THE REQUIREMENT. The card had grown a line per fact — day and
        time on one row, format and surface on another — and each cost the fold
        a card. The pill and the badges share ONE row, which is what buys the
        height back without dropping anything.
      */}
      <span data-testid="card-venue" className="block truncate text-body-lg font-semibold leading-tight text-bone">
        {venueDisplayName(game.venue, pitchName)}
      </span>

      <div className="mt-[6px] flex items-center justify-between gap-2">
        {/*
          THE DAY-TIME PILL. Semi-transparent with a solid outline, the same
          treatment as the badges opposite it — a glanceable object rather than
          a line of prose. START TIME ONLY on a list card; the game card
          carries the full span.
        */}
        {/*
          THE TIME ALONE (Section 3, item 5). The date is gone from the pill —
          the DAY-GROUP HEADING above carries it, and several games on one day
          share one heading rather than repeating the date on every card.

          LARGER (item 6): `body-lg` against the previous 10px. It is the one
          number a reader scans a list for, and it was set smaller than the
          badges opposite it.
        */}
        <span
          data-testid="card-when"
          className="min-w-0 truncate rounded-pill border border-hairline-strong bg-bone/[.06] px-3 py-[3px] text-body-lg font-semibold text-bone"
        >
          {formatTime(game.starts_at)}
        </span>

        <CardBadges format={game.format} surface={game.surface} />
      </div>

      <div className="mt-[10px]">
        <CapacityBar bookedCount={bookedCount} capacity={game.capacity} size="slim" />
      </div>

      <div className="mt-[6px] flex items-center justify-between gap-3">
        <span data-testid="row-spots">
          <SpotsLeft bookedCount={bookedCount} capacity={game.capacity} />
        </span>

        {/*
          The faces sit on the spots row rather than under it — the last line
          the compression could remove, and the two read as one statement
          about who is in and how much room is left. Absent at zero (§2.1).
        */}
        {roster.length > 0 && (
          <AvatarRow players={roster} max={3} size="card" supabaseUrl={supabaseUrl} />
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
        className="block rounded-card bg-surface px-4 py-3 opacity-45"
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
      className="block rounded-card bg-surface px-4 py-3 no-underline transition-colors hover:bg-surface-raised"
    >
      {body}
    </Link>
  );
}
