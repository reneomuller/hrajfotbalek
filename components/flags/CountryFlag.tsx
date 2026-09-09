import { FlagCZ, FlagGB, FlagRU, FlagUA } from "@/components/flags/Flags";

/**
 * A country's flag, by ISO 3166 alpha-2 code (round 28, item 4).
 *
 * FOUR COUNTRIES HAVE ONE, AND 245 DO NOT — stated plainly here rather than
 * discovered by whoever next sets their country to Portugal.
 *
 * `components/flags/Flags.tsx` holds four hand-drawn inline SVGs, and its
 * header is the law they were drawn under: **not emoji**, because Windows
 * ships no regional-indicator glyphs and `🇺🇦` renders as the letters "UA" in
 * boxes for a large share of desktop visitors. That rules out the one-line
 * codepoint trick that would have covered all 249 countries, and drawing the
 * other 245 by hand is its own round of work rather than a line in this one.
 *
 * SO THIS RENDERS NOTHING WHEN IT HAS NO FLAG, and the caller shows the
 * country's NAME beside it — which it does in every case anyway. A player from
 * Portugal reads "Portugal"; a player from Czechia reads a Czech flag and
 * "Czechia". Nobody reads a blank space or a placeholder, and nobody reads a
 * box with two letters in it.
 *
 * The four are not an arbitrary subset: they are exactly the countries behind
 * the product's four languages, which is where this crew actually comes from.
 */
const FLAGS = {
  CZ: FlagCZ,
  GB: FlagGB,
  RU: FlagRU,
  UA: FlagUA,
} as const;

export function hasFlag(code: string | null | undefined): boolean {
  return Boolean(code && code.toUpperCase() in FLAGS);
}

export function CountryFlag({
  code,
  width = 18,
  className,
}: {
  code: string | null | undefined;
  width?: number;
  className?: string;
}) {
  if (!code) return null;
  const Flag = FLAGS[code.toUpperCase() as keyof typeof FLAGS];
  if (!Flag) return null;
  return <Flag width={width} className={className} />;
}
