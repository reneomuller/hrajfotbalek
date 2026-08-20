import Link from "next/link";
import { AvatarRow } from "@/components/game/AvatarRow";
import { CapacityBar } from "@/components/game/CapacityBar";
import { CardBadges } from "@/components/game/CardBadges";
import { venueDisplayName } from "@/lib/venues/displayName";
import { SpotsLeft } from "@/components/game/SpotsLeft";
import { formatTime } from "@/lib/format";
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
  const t = await getStrings();

  const body = (
    <>
      {/*
        THE PHOTO, AND THE SCRIM OVER IT (redesign v2, R6a).

        The frames back every list card with the pitch photograph, faded hard.
        `public/pitch-default.jpg` is the single default for all games —
        per-venue photos are a later concern and `venues.image_path` is not
        touched by this round.

        TWO LAYERS, NOT A CSS BACKGROUND IMAGE. An `<img>` with `object-cover`
        plus a gradient scrim, rather than an arbitrary background-image
        utility — and note that writing that utility's literal syntax even
        inside a COMMENT makes Tailwind generate it, which is how this file
        first shipped a rule reading `background-image: url()` and took the
        stylesheet down. The scrim needs its own
        opacity ramp (lighter at the top where the sky is, heavier at the foot
        where the avatars and the spots figure sit) and a single background
        declaration cannot carry both the photo and that ramp without a second
        layer anyway.

        `aria-hidden` and empty `alt` — it is the same photograph on every card
        and says nothing about this game. A screen reader announcing "aerial
        view of playing fields" twelve times down a list is noise.

        THE SCRIM IS THE CONTRAST FLOOR, and it is asserted rather than judged:
        `e2e/strips-redesign-card.spec.ts` measures that the time pill's volt
        stroke is still `rgb(200, 255, 0)` at 1.5px over the photo, and that the
        scrim element covers the photo exactly. Values derived from the frames.
      */}
      <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {/*
          THE CROP IS BOTTOM-ANCHORED, NOT CENTRED (round 7, item 3).

          `pitch-default.jpg` is 640x336 and its top fifth is sky and
          mountains. On the DETAIL header and the PROFILE cover that reads
          well — those bands are tall enough to want a horizon. The list card
          is a 358x159 strip, and `object-center` on it put the pale sky
          directly behind the venue title, which is the single most
          conspicuous way this card failed to look like `p02`: the frame's
          card is green field edge to edge.

          `object-bottom` pushes the visible window down onto the fields. It
          cannot remove the horizon entirely — cover only has 24px of slack at
          this height — but it takes the pale band out from behind the title,
          which is where it was doing the damage.

          NOT A SECOND CROPPED ASSET. One default is R6's rule and a second
          file is a second thing to keep in step; this is the same image read
          differently by one surface.
        */}
        <img
          src="/pitch-default.jpg"
          alt=""
          data-testid="card-photo"
          className="h-full w-full object-cover object-bottom"
        />
        {/*
          THE GRADIENT IS A RAMP, NOT A DIMMER — rebalanced from p02.

          The first version was a uniform-ish wash (.68 -> .82 -> .92) and it
          crushed the photograph to near-invisible: the card read as a dark
          slab that happened to have texture. p02 draws the opposite — the
          pitch is CLEARLY there behind the venue title, and the image darkens
          as it falls toward the avatars and the join cue, which is where the
          small text lives.

          So the stops now start almost clear and end heavy. The dark end is
          what the bar, the faces and the cue sit on; the clear end is the
          picture doing the job it was added for.
        */}
        {/*
          THE FADE HAS A BOUNDARY, AND THE BOUNDARY IS THE CAPACITY BAR
          (round 8, item 5).

          It was `.12 -> .52 -> .90`: a wash across the whole card that never
          finished. The photograph was faintly present everywhere and fully
          gone nowhere, so the bar, the faces and the cue all sat on texture
          instead of on a surface — and the top, where the photograph is
          supposed to read, was being dimmed to make that texture survivable.

          Measured off the rendered card at 390px: the venue title ends at 23%,
          the time pill at 56%, and the capacity bar begins at about 58%. So
          the ramp holds light through the title and the time row, climbs
          across the pill's lower edge, and reaches FULL `ink` at 72% — before
          the bar, and well before the faces and the cue. Everything from
          there down is flat page surface, which is what `p02` draws.

          `to-ink`, NOT `to-ink/[.90]`. The old end left a tenth of the
          photograph under the busiest, smallest elements on the card; a
          gradient that stops short of its own colour is a gradient with a
          seam nobody put there on purpose.
        */}
        <span
          data-testid="card-scrim"
          className="absolute inset-0 bg-gradient-to-b from-ink/[.15] via-ink/[.45] via-50% to-ink to-70%"
        />
        {/*
          TEXT PROTECTION, LOCAL TO THE TITLE LINE.

          The venue title sits at the top, and rather than dimming the WHOLE
          card to rescue one line, this is a short gradient behind the title
          band only.

          `.72` -> `.55`, AND THE CROP IS WHY IT CAN COME DOWN (round 7, item
          3). `.72` was set against a PALE SKY sitting behind the title — the
          measurement that mattered was white-on-cloud. `object-bottom` above
          puts green field there instead, which is both darker and textured,
          so the same legibility needs less scrim.

          64px -> 48px (round 8, item 5). The title ends at 23% of a 146px
          card, so 48px covers it exactly; at 64 this reached down into the
          time row and dimmed the part of the photograph the new boundary is
          there to keep visible. Measured against `p02`: the
          frame's card reads about 76 mean luminance across its title band and
          this was rendering about 60, which is the "washed out, does not match
          the frame" complaint stated as a number.

          The two changes are one change. Dropping the scrim alone would put
          white text on a pale sky; re-cropping alone would leave the photo
          needlessly dim. Neither is correct on its own.

          A separate element rather than another stop on the ramp above,
          because the two do different jobs and one of them is allowed to
          change when the type does.
        */}
        <span
          data-testid="card-title-scrim"
          className="absolute inset-x-0 top-0 h-[48px] bg-gradient-to-b from-ink/[.55] to-transparent"
        />
      </span>

      {/*
        THE ANATOMY, RE-ORDERED TO THE FRAMES:

          venue                      · format/surface badges
          time pill                  · spots left
          capacity bar
          faces                      · Join → (paint)

        What moved: the spots figure comes UP onto the time row, and the faces
        drop to share the last row with the join cue. The previous order put
        spots and faces together on the final row, which was right on a flat
        card and wrong over a photograph — the two loudest elements both sat in
        the darkest band and the middle of the card carried nothing.
      */}
      <span className="relative flex items-start justify-between gap-2">
        <span data-testid="card-venue" className="min-w-0 flex-1 truncate text-body-lg font-bold leading-tight text-white">
          {venueDisplayName(game.venue, pitchName)}
        </span>
        <CardBadges format={game.format} surface={game.surface} />
      </span>

      <span className="relative mt-2 flex items-center justify-between gap-2">
        <span
          data-testid="card-when"
          /*
            `border-2`, NOT `border-[1.5px]`, AND THE REASON IS THE DEVICE.

            The night round set this to 1.5px to make the volt outline read.
            It never rendered: Chrome snaps a border to whole device pixels, so
            at this DPR 1.5px is used — and REPORTED by getComputedStyle — as
            1px. The old spec asserted `1px` and passed, which is how it went
            unnoticed through two rounds.

            My first diagnosis here was wrong and is recorded so nobody repeats
            it: I blamed `.lifted` beating the arbitrary utility from the
            components layer. The built stylesheet disproves it — the utility
            is emitted after `.lifted` and does win. The pixel snapping is the
            whole of it.

            2px is a whole pixel at every DPR, so it renders everywhere and the
            assertion means something. The fill is spelled out rather than
            taken from `.lifted` simply because this element states its own
            stroke; that part of the change stands on its own.
          */
          className="min-w-0 shrink-0 truncate rounded-pill border-2 border-volt bg-surface-raised px-3 py-[6px] text-body-lg font-bold text-bone"
        >
          {formatTime(game.starts_at)}
        </span>
        <span data-testid="row-spots" className="shrink-0">
          <SpotsLeft bookedCount={bookedCount} capacity={game.capacity} />
        </span>
      </span>

      <span className="relative mt-2 block">
        <CapacityBar bookedCount={bookedCount} capacity={game.capacity} size="slim" />
      </span>

      <span className="relative mt-2 flex items-center justify-between gap-3">
        {/* Absent at zero (§2.1) — a ring drawn around nobody is a question. */}
        {roster.length > 0 ? (
          <AvatarRow players={roster} max={3} size="card" supabaseUrl={supabaseUrl} />
        ) : (
          <span />
        )}

        {/*
          `Join →` — PAINT, NOT A CONTROL (R1).

          A `<span>`. No href, no handler, no focus stop, no role. Ruling E is
          UPHELD rather than reversed: the whole card is still one anchor, and
          a link inside a link is the construction E removed. This only makes
          the card LOOK like it carries the action it has always carried.

          `aria-hidden`, because it is decoration on top of a link that already
          announces itself — without it a screen reader reads the card's name
          and then the word "Join" as if a second control existed.

          Not rendered on a past card: the state is not tappable at all, and a
          call to action on it would be a lie about what the card does.
        */}
        {!past && (
          <span
            aria-hidden
            data-testid="card-join-cue"
            className="shrink-0 rounded-pill bg-volt px-4 py-1 text-body font-bold text-ink"
          >
            {t.games.cardJoinCue} →
          </span>
        )}
      </span>
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
        className="relative isolate block overflow-hidden rounded-card bg-surface px-4 py-3 opacity-45"
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
      className="relative isolate block overflow-hidden rounded-card bg-surface px-4 py-3 no-underline transition-colors"
    >
      {body}
    </Link>
  );
}
