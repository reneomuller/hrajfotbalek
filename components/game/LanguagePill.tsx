import { FlagCZ, FlagGB, FlagRU, FlagUA } from "@/components/flags/Flags";
import type { GameLanguage } from "@/lib/games/language";

/**
 * The two flags of a game's language, as one object (round 18, items 2 and 3).
 *
 * TWO VARIANTS OF ONE THING, and they are one component because they must not
 * drift: the card's pill and the detail's pill say the same fact about the
 * same game two hundred pixels apart, and a reader who sees blue-and-yellow on
 * a list card must meet blue-and-yellow on the page it opens.
 *
 *   `badge`  — the list card, beside the format badge. Outlined and quiet, the
 *              same geometry as `.badge-pill` so the two sit on one baseline.
 *   `filled` — the detail's Language row (item 3). Split half and half, edge to
 *              edge, no gap and no fill of its own: the flags ARE the pill.
 *
 * THE FLAGS ARE NOT LABELLED IN WORDS anywhere in this component, and that is
 * the owner's format — "flag slash flag". On the detail the row's own `<dt>`
 * says "Language", which is what a screen reader reads; on the card the pill
 * sits in a row that already names the game. Each flag is `aria-hidden` for
 * the same reason.
 */
const PAIRS = {
  "en-cs": [FlagGB, FlagCZ],
  "uk-ru": [FlagUA, FlagRU],
} as const;

export function LanguagePill({
  language,
  variant = "badge",
}: {
  language: GameLanguage;
  variant?: "badge" | "filled";
}) {
  const [First, Second] = PAIRS[language];

  if (variant === "filled") {
    /*
     * HALF AND HALF, EDGE TO EDGE. `flex` with two `flex-1` cells and the
     * flags stretched to fill them — rather than two fixed-width SVGs with a
     * gap — so the split lands exactly at the middle whatever the pill's
     * width, which is what "half/half" has to mean to survive a translation
     * widening the row.
     */
    return (
      <span
        data-testid="language-pill"
        data-language={language}
        data-variant="filled"
        /*
          THE HEIGHT COMES FROM `.badge-pill`, NOT FROM A NUMBER.

          Item 3 asks for "the same height as the 6v6 and skill badges", and
          that height is TEXT-driven: `text-small` at `py-[6px]` inside a 2px
          border computes to 34.19px. Hardcoding 34px would pin a font metric
          into a class name and drift the first time `text-small` moves.

          So the pill keeps `.badge-pill` — its padding, its border box, its
          radius — and an invisible zero-width space inside it establishes the
          same line box the badges get from their text. The flags then fill the
          border box as an absolute layer. The pill measures exactly what a
          badge measures because it is built the same way.

          `border-transparent`: this variant is FILLED, so it has the badge's
          border BOX without a visible stroke. Dropping the border instead
          would make it 4px shorter than its neighbours.
        */
        className="badge-pill relative w-[56px] overflow-hidden border-transparent px-0"
      >
        <span aria-hidden>&#8203;</span>

        {/*
          HALF AND HALF, EDGE TO EDGE. Two `w-1/2` cells with the flags
          stretched to fill them — rather than two fixed-width SVGs with a gap
          — so the split lands exactly at the middle whatever the pill's width,
          which is what "half/half" has to mean to survive a translation
          widening the row.
        */}
        <span className="absolute inset-0 flex">
          <span className="flex w-1/2 items-stretch [&>svg]:h-full [&>svg]:w-full">
            <First width={28} />
          </span>
          <span className="flex w-1/2 items-stretch [&>svg]:h-full [&>svg]:w-full">
            <Second width={28} />
          </span>
        </span>
      </span>
    );
  }

  return (
    <span
      data-testid="language-pill"
      data-language={language}
      data-variant="badge"
      /*
        `.badge-pill` CARRIES THE GEOMETRY — height, radius, padding, border
        width — written once in globals.css, which is what keeps this on the
        same baseline as the 6v6 badge beside it. This file chooses the ink and
        nothing else, exactly as `CardBadges` does.
      */
      /*
        `self-stretch` RATHER THAN A HEIGHT. `.badge-pill`'s height is
        TEXT-driven — `text-small` at `py-[6px]` with a 2px border computes to
        34.19px — and this pill has no text in it, so it came out 24px and sat
        5px above the format badge's baseline. Matching by hardcoding 34.19px
        would pin a font metric into a class name and break the first time
        `text-small` moves.

        Stretching to the flex line instead takes the height FROM the badge
        beside it, which is the thing it has to match. The parent is
        `items-center`; `self-stretch` overrides that for this item only.
      */
      className="badge-pill inline-flex items-center gap-[3px] self-stretch border-hairline-strong bg-surface-raised px-[6px]"
    >
      <First width={16} />
      <Second width={16} />
    </span>
  );
}
