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
        className="inline-flex h-[22px] w-[52px] overflow-hidden rounded-pill"
      >
        <span className="flex h-full w-1/2 items-stretch [&>svg]:h-full [&>svg]:w-full">
          <First width={26} />
        </span>
        <span className="flex h-full w-1/2 items-stretch [&>svg]:h-full [&>svg]:w-full">
          <Second width={26} />
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
      className="badge-pill inline-flex items-center gap-[3px] border-hairline-strong bg-surface-raised px-[6px]"
    >
      <First width={16} />
      <Second width={16} />
    </span>
  );
}
