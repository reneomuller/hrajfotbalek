import { FlagCZ, FlagGB, FlagRU, FlagUA } from "@/components/flags/Flags";
import type { GameLanguage } from "@/lib/games/language";

/**
 * The two flags of a game's language — TWO CIRCLES, side by side (round 24,
 * item 6).
 *
 * THE THIRD CONSTRUCTION, AND THE LINEAGE IS THE POINT:
 *
 *   ROUND 18 — two of them at once. A bordered chip holding two 16×8 flags on
 *     the list card, and a filled box holding two 26×30 flags on the detail.
 *     Different sizes, and the second distorted: a 2:1 drawing forced into a
 *     nearly-square half.
 *
 *   ROUND 19 — one split pill. The flags WERE the pill: two halves of a single
 *     capsule with a hairline between them, `slice`-cropped, the height taken
 *     from `.badge-pill` so it matched the badges beside it. It fixed the
 *     distortion and the disagreement, and the shape it produced was a capsule
 *     cut down the middle — which reads as one object showing two states
 *     rather than as two languages.
 *
 *   ROUND 24 — two circles. Two languages are two things, and two marks say so
 *     where a divided one does not. It is also the shape a flag wants: a
 *     roundel is how every scoreboard in the world draws one.
 *
 * THE HEIGHT DOES NOT MOVE, and that is the constraint that made this a
 * redraw rather than a redesign. `.badge-pill` computes to 34.19px from
 * `text-small` at `py-[6px]` inside a 2px border, and the pill borrowed that
 * class purely as a height scaffold. The circles keep the same number by
 * measuring it once — `CIRCLE_PX` — so the row beside the format badge is
 * unchanged and no caller has to know anything moved.
 *
 * BOTH CIRCLES ARE IDENTICAL AND THE SIZE IS PINNED IN CODE, because round
 * 18's bug was two flags that were meant to match and did not. A square box
 * with a 50% radius cannot drift into an oval, and `shrink-0` stops a flex
 * parent from squeezing one of them.
 *
 * `slice` ON THE FLAGS, not stretch: a 2:1 drawing covers a square and crops,
 * which is the only way to keep a flag's proportions in a box that is not its
 * shape. The crop is centred, so every flag shows its middle band.
 *
 * ARIA: every flag is hidden. On the detail the row's own `<dt>` says
 * "Language"; on the card the pill sits in a row that already names the game.
 * Announcing "flag of Ukraine, flag of Russia" twice down a list is noise.
 */
const PAIRS = {
  "en-cs": [FlagGB, FlagCZ],
  "uk-ru": [FlagUA, FlagRU],
} as const;

/**
 * One circle's diameter, and the height of the whole control.
 *
 * 34px is `.badge-pill`'s computed height (34.19px, rounded down so a circle
 * never out-measures the badge it sits beside). Pinned as a number rather than
 * inherited from the class, because the class's height comes from a FONT
 * METRIC and this element has no text — round 19 solved that with an
 * invisible zero-width space, which worked and left the control's size
 * depending on a character nobody could see.
 */
const CIRCLE_PX = 34;

/** The space between them. Narrow enough to read as a pair, wide enough to
 *  read as two. */
const GAP_PX = 4;

export function LanguagePill({ language }: { language: GameLanguage }) {
  const [First, Second] = PAIRS[language];

  return (
    <span
      data-testid="language-pill"
      data-language={language}
      className="inline-flex items-center"
      style={{ gap: GAP_PX }}
    >
      {[First, Second].map((Flag, index) => (
        <span
          key={index}
          data-testid="language-pill-half"
          /*
            `overflow-hidden` plus `rounded-full` is what makes the crop
            circular: the flag is a rectangle filling the box, and the box
            clips it. A border-radius on the SVG itself would not clip its
            children.

            A HAIRLINE RING, and it is `ink` rather than a hairline token for
            round 19's reason: `hairline-strong` is white at .14 and vanishes
            on the white band of the Czech and Russian flags, which are two of
            the four this has to work on. A dark ring reads on all four and
            separates the circle from a photograph behind it.
          */
          className="relative shrink-0 overflow-hidden rounded-full ring-1 ring-inset ring-ink/70"
          style={{ width: CIRCLE_PX, height: CIRCLE_PX }}
        >
          <Flag cover className="absolute inset-0 h-full w-full" />
        </span>
      ))}
    </span>
  );
}
