/**
 * Four flags, as inline SVG (round 18).
 *
 * NOT EMOJI, AND THAT IS THE WHOLE REASON THIS FILE EXISTS. `🇺🇦` is a pair of
 * regional-indicator codepoints that the font is expected to ligature into a
 * flag. Windows ships no such glyphs — every version of Segoe UI Emoji renders
 * the two letters instead — so `🇺🇦 / 🇷🇺` reads as "UA / RU" in boxes on a
 * large share of desktop visitors. The owner asked for flags; on the platform
 * where it matters, emoji are not flags.
 *
 * NO `id` ATTRIBUTES ANYWHERE IN THESE, and that is a correctness requirement
 * rather than tidiness. A game card renders a flag pair per row, so a list of
 * twelve games puts twenty-four of these in one document; `id` is
 * document-unique in HTML, and a `clipPath` referenced by id would resolve
 * every instance to whichever one parsed first.
 *
 * THE UNION JACK IS THEREFORE SIMPLIFIED, and this is the one place these
 * drawings are not exact. A correct Union Jack counterchanges St Patrick's
 * saltire — the red diagonals sit against one edge of the white in two
 * quadrants and the other edge in the other two — which needs a clip path or
 * eight hand-computed polygons. These render at roughly 18x12 CSS pixels,
 * where the counterchange is a fraction of one pixel and invisible at any
 * DPR. So the red saltire is drawn as plain diagonals. Stated here rather
 * than discovered later by somebody scaling one of these up.
 *
 * `2:1` VIEWBOXES throughout, so the four are interchangeable in a layout and
 * a caller sets one dimension.
 *
 * `aria-hidden` and no `<title>`: every one of these appears beside or inside
 * a control that already names the thing in words. A screen reader announcing
 * "flag of Ukraine, flag of Russia" before a link labelled "Message on
 * Telegram" is noise.
 */

const BASE = "block shrink-0";

interface FlagProps {
  /** Rendered width in pixels; height follows the 2:1 ratio. */
  width?: number;
  className?: string;
}

function svgProps({ width = 18, className }: FlagProps) {
  return {
    viewBox: "0 0 60 30",
    width,
    height: width / 2,
    "aria-hidden": true as const,
    focusable: "false" as const,
    className: className ? `${BASE} ${className}` : BASE,
  };
}

/** United Kingdom — see the note above on the simplified saltire. */
export function FlagGB(props: FlagProps) {
  return (
    <svg {...svgProps(props)}>
      <rect width="60" height="30" fill="#012169" />
      <path d="M0 0 L60 30 M60 0 L0 30" stroke="#FFFFFF" strokeWidth="6" />
      <path d="M0 0 L60 30 M60 0 L0 30" stroke="#C8102E" strokeWidth="4" />
      <path d="M30 0 V30 M0 15 H60" stroke="#FFFFFF" strokeWidth="10" />
      <path d="M30 0 V30 M0 15 H60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}

/** Czechia — white over red, with the blue hoist triangle. */
export function FlagCZ(props: FlagProps) {
  return (
    <svg {...svgProps(props)}>
      <rect width="60" height="15" fill="#FFFFFF" />
      <rect y="15" width="60" height="15" fill="#D7141A" />
      <path d="M0 0 L30 15 L0 30 Z" fill="#11457E" />
    </svg>
  );
}

/** Ukraine — blue over yellow. */
export function FlagUA(props: FlagProps) {
  return (
    <svg {...svgProps(props)}>
      <rect width="60" height="15" fill="#0057B7" />
      <rect y="15" width="60" height="15" fill="#FFDD00" />
    </svg>
  );
}

/** Russia — white, blue, red. */
export function FlagRU(props: FlagProps) {
  return (
    <svg {...svgProps(props)}>
      <rect width="60" height="10" fill="#FFFFFF" />
      <rect y="10" width="60" height="10" fill="#0039A6" />
      <rect y="20" width="60" height="10" fill="#D52B1E" />
    </svg>
  );
}
