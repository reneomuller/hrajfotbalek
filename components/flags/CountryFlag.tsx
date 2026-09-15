import { isKnownCountry } from "@/lib/auth/countries";

/**
 * A country's flag, by ISO 3166-1 alpha-2 code, IN A CIRCLE.
 *
 * ~~FOUR COUNTRIES HAVE ONE, AND 245 DO NOT.~~ ALL 197 THE PRODUCT OFFERS HAVE
 * ONE (round 35 v2, item 6), which closes row 212. There are no flagless edge
 * entries: the signup list is 197 codes, `country-flag-icons` ships 267, and
 * the intersection is the whole list — checked rather than assumed, by
 * `lib/auth/__tests__/flagCoverage.test.ts`.
 *
 * STILL NOT EMOJI, and that law is unchanged and is the reason a library was
 * needed at all. `🇺🇦` is a pair of regional-indicator codepoints the font is
 * expected to ligature; Windows ships no such glyphs, so it renders as "UA" in
 * boxes for a large share of desktop visitors.
 *
 * SERVED FROM `/public`, NOT IMPORTED. Pulling 197 React components into the
 * bundle to render one flag is 111 KB nobody asked for on every page; an `<img>`
 * fetches exactly the one country this player is from, and the browser caches
 * it. `scripts/sync-flags.mjs` copies them out of the package, so the list in
 * `public/flags/3x2` is derived rather than curated — a country added to
 * `lib/auth/countries.ts` gets its flag by re-running one script.
 *
 * THE CIRCLE IS THE GAME BOX'S CONSTRUCTION, DELIBERATELY IDENTICAL:
 * `overflow-hidden` + `rounded-full` on a fixed-size box, the flag filling it
 * with `object-cover`, and a `ring-ink/70` hairline. A border-radius on the
 * image alone would not clip it, and the dark ring is round 19's finding —
 * `hairline-strong` is white at .14 and vanishes on the white band of the Czech
 * and Russian flags, which are two of the ones this has to work on.
 *
 * `aria-hidden` and empty `alt`: every caller prints the country's NAME beside
 * it. A screen reader announcing "flag of Czechia, Czechia" is noise.
 */

/** The sizes this product draws a flag at. Pinned so a spec can assert them. */
export const FLAG_CIRCLE_PX = {
  /** Beside a name on a public profile. */
  profile: 18,
  /** In an admin list row, where it sits with 12px type. */
  compact: 14,
} as const;

export type FlagSize = keyof typeof FLAG_CIRCLE_PX;

export function hasFlag(code: string | null | undefined): boolean {
  return isKnownCountry(code);
}

export function CountryFlag({
  code,
  size = "profile",
  className,
}: {
  code: string | null | undefined;
  size?: FlagSize;
  className?: string;
}) {
  if (!isKnownCountry(code)) return null;

  const upper = code!.toUpperCase();
  const px = FLAG_CIRCLE_PX[size];

  return (
    <span
      aria-hidden
      data-testid="country-flag"
      data-country={upper}
      className={[
        "relative inline-block shrink-0 overflow-hidden rounded-full ring-1 ring-inset ring-ink/70",
        className ?? "",
      ]
        .join(" ")
        .trim()}
      style={{ width: px, height: px }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/flags/3x2/${upper}.svg`}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
    </span>
  );
}
