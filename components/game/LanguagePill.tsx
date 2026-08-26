import { FlagCZ, FlagGB, FlagRU, FlagUA } from "@/components/flags/Flags";
import type { GameLanguage } from "@/lib/games/language";

/**
 * The two flags of a game's language — and the flags ARE the pill (round 19,
 * item 1).
 *
 * ONE CONSTRUCTION, EVERYWHERE. Round 18 shipped two: a bordered chip holding
 * two 16x8 flags on the list card, and a filled box holding two 26x30 flags on
 * the detail. They were different sizes and the second was distorted — a 2:1
 * drawing forced into a nearly-square half. This has no variants, so the card
 * and the detail cannot disagree about what a language looks like.
 *
 * NO PILL CHROME. There is no border, no fill and no padding of its own: two
 * flags side by side, a hairline between them, and the outer corners clipped
 * to the pill radius. What the reader sees is the flags.
 *
 * THE HEIGHT COMES FROM `.badge-pill`, WHICH IS WHY IT IS STILL HERE. That
 * class's height is TEXT-driven — `text-small` at `py-[6px]` inside a 2px
 * border computes to 34.19px — and this element has no text. So it keeps the
 * class purely as a height scaffold: `border-transparent` and `px-0` remove
 * everything visible, an invisible zero-width space establishes the same line
 * box the badges get from their words, and the flags fill the border box as an
 * absolute layer. The pill measures exactly what a badge measures because it
 * is built the same way — no hardcoded 34.19 pinning a font metric into a
 * class name, and no `self-stretch` that only works next to a badge.
 *
 * `slice` ON THE FLAGS, not stretch. Each half is about 26x34; a 2:1 drawing
 * covers it and crops, which is the only way to keep a flag's proportions in a
 * box that is not its shape.
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
 * The pill's outer width.
 *
 * `.badge-pill` carries a 2px border, and Tailwind's `box-border` means that
 * border eats into this number — so the two halves and their divider share
 * `PILL_WIDTH_PX - 4`. Stated as the OUTER width because that is what sits
 * next to the format badge and what a spec measures.
 */
const PILL_WIDTH_PX = 57;

export function LanguagePill({ language }: { language: GameLanguage }) {
  const [First, Second] = PAIRS[language];

  return (
    <span
      data-testid="language-pill"
      data-language={language}
      className="badge-pill relative overflow-hidden border-transparent px-0"
      style={{ width: PILL_WIDTH_PX }}
    >
      {/* Sizes the line box, so the height tracks `text-small`. */}
      <span aria-hidden>&#8203;</span>

      <span className="absolute inset-0 flex">
        {/*
          `flex-1`, NOT A FIXED WIDTH. Two equal shares of whatever the border
          box leaves is a guarantee; two 26px halves inside a box that turned
          out to be 49px wide is an arithmetic coincidence that flexbox quietly
          corrects — which is how round 18 shipped flags at 24.05px while the
          code said 26.
        */}
        <span
          data-testid="language-pill-half"
          className="relative flex-1 overflow-hidden"
        >
          <First cover className="absolute inset-0 h-full w-full" />
        </span>

        {/*
          THE DIVIDER, AND IT IS `ink` RATHER THAN A HAIRLINE TOKEN.
          `hairline-strong` is white at .14, which vanishes on the white half
          of the Czech and Russian flags — the two places a divider has to
          work. A dark line reads on all four.
        */}
        <span aria-hidden data-testid="language-pill-divider" className="w-px bg-ink/70" />

        <span
          data-testid="language-pill-half"
          className="relative flex-1 overflow-hidden"
        >
          <Second cover className="absolute inset-0 h-full w-full" />
        </span>
      </span>
    </span>
  );
}
