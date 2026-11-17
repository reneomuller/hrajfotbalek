import { readFileSync } from "node:fs";
import { join } from "node:path";
import { capacitySegments } from "@/lib/games/capacity";
import type { SpotsTone } from "@/lib/games/urgency";
import { OG_MARK_DATA_URI } from "@/lib/og/mark";
import type { StoryFact } from "@/lib/og/storyFacts";
import { COLORS } from "@/lib/og/theme";
import type { Strings } from "@/lib/strings";

/**
 * The parts a game is drawn with, shared by the 9:16 story (`storyImage.tsx`)
 * and the link preview WhatsApp shows (`shareImage.tsx`) — 2026-11-17, the
 * owner: the preview should "better reflect the instagram visual".
 *
 * ONE SET OF PARTS, TWO FRAMES. The pill, the tiles and the bar are written
 * once, at the story's sizes; the preview passes its own. A tweak to the story
 * therefore reaches the preview too, rather than the two drifting apart the way
 * the old preview had drifted from everything else.
 *
 * Satori, not the DOM: every element with more than one child declares
 * `display`, and styles are inline because Tailwind does not run here. Colours
 * come from the token table by way of `lib/og/theme.ts`.
 */

export const TONE_COLOR: Record<SpotsTone, string> = {
  plenty: COLORS.volt,
  few: COLORS.warn,
  critical: COLORS.danger,
  full: COLORS.danger,
};

/**
 * Anton for the display lines, Barlow Condensed for the small ones — both the
 * site's own, both under the SIL Open Font License (`lib/og/fonts/`). Read from
 * disk per request: `next.config.ts` traces the folder into every route that
 * draws with them.
 *
 * NEITHER HAS CYRILLIC, so each stack ends in Onest, exactly as the site's
 * `display` stack does (`tailwind.config.ts`): the link preview is drawn in the
 * reader's language, and without it a Russian date fell to the renderer's
 * own default face, a size wider, and overran its tile. Per glyph, not per
 * line — Latin and Czech still draw in Anton and Barlow, so the story, which
 * is Czech, is unchanged. ExtraBold beside Anton, SemiBold beside Barlow.
 */
export const DISPLAY_FONT = "Anton, OnestDisplay";
export const TEXT_FONT = "Barlow, OnestText";

export function storyFonts() {
  const fontDir = join(process.cwd(), "lib/og/fonts");
  const face = (name: string, file: string, weight: 400 | 600) => ({
    name,
    data: readFileSync(join(fontDir, file)),
    weight,
    style: "normal" as const,
  });
  return [
    face("Anton", "Anton-Regular.ttf", 400),
    face("Barlow", "BarlowCondensed-SemiBold.ttf", 600),
    // Registered at the weight its partner is drawn at, so the fallback is chosen.
    face("OnestDisplay", "Onest-ExtraBold.ttf", 400),
    face("OnestText", "Onest-SemiBold.ttf", 600),
  ];
}

/** The story's mark; the pill's every other measure is a share of it. */
const STORY_MARK_PX = 128;

/**
 * The mark and the wordmark on a dark pill, the header's pairing. Drawn at the
 * story's proportions for any mark size, so a smaller pill is the same pill.
 */
export function BrandPill({ markPx, t, upper }: { markPx: number; t: Strings; upper: (text: string) => string }) {
  const s = markPx / STORY_MARK_PX;
  const height = markPx + 24 * s;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        alignSelf: "flex-start",
        height,
        padding: `${12 * s}px ${44 * s}px ${12 * s}px ${12 * s}px`,
        borderRadius: height / 2,
        backgroundColor: "rgba(8,8,8,.78)",
        border: `2px solid ${COLORS.hairline}`,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={OG_MARK_DATA_URI} width={markPx} height={markPx} style={{ borderRadius: markPx / 2 }} alt="" />
      <div style={{ display: "flex", marginLeft: 28 * s, fontFamily: DISPLAY_FONT, fontSize: 76 * s, letterSpacing: 1 }}>
        <span style={{ color: "white" }}>{upper(t.brand.wordmarkLead)}</span>
        <span style={{ color: COLORS.volt, marginLeft: 18 * s }}>{upper(t.brand.wordmarkAccent)}</span>
      </div>
    </div>
  );
}

export interface TileSizes {
  labelPx: number;
  labelTracking: number;
  valuePx: number;
  padY: number;
  padX: number;
  radius: number;
  /** Between two tiles. */
  gap: number;
}

export const STORY_TILES: TileSizes = { labelPx: 32, labelTracking: 3, valuePx: 86, padY: 26, padX: 30, radius: 28, gap: 24 };

/** One row: the format and the length, each in its own tile. */
export function FactTiles({
  facts,
  sizes,
  upper,
  marginTop = 0,
  tileMinWidth,
}: {
  facts: StoryFact[];
  sizes: TileSizes;
  upper: (text: string) => string;
  marginTop?: number;
  /**
   * Each tile at least this wide and wider for a long label ("ДЛИТЕЛЬНОСТЬ");
   * without one the tiles share the row.
   */
  tileMinWidth?: number;
}) {
  return (
    <div style={{ display: "flex", marginTop }}>
      {facts.map((fact, i) => (
        <div
          key={fact.key}
          style={{
            display: "flex",
            flexDirection: "column",
            ...(tileMinWidth ? { minWidth: tileMinWidth, flexShrink: 0 } : { flex: 1 }),
            marginLeft: i === 0 ? 0 : sizes.gap,
            padding: `${sizes.padY}px ${sizes.padX}px`,
            borderRadius: sizes.radius,
            backgroundColor: COLORS.surface,
            border: `2px solid ${COLORS.hairline}`,
          }}
        >
          <span style={{ fontSize: sizes.labelPx, letterSpacing: sizes.labelTracking, color: COLORS.muted }}>
            {upper(fact.label)}
          </span>
          {/* On one line at one size — two tiles leave "90 min" room. */}
          <span style={{ marginTop: 6 * (sizes.valuePx / STORY_TILES.valuePx), fontFamily: DISPLAY_FONT, fontSize: sizes.valuePx, color: "white", whiteSpace: "nowrap" }}>
            {fact.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/** One notch per spot, filled in the availability's tone — the app's bar. */
export function CapacityBar({
  bookedCount,
  capacity,
  color,
  heightPx,
  gapPx,
  marginTop,
}: {
  bookedCount: number;
  capacity: number;
  color: string;
  heightPx: number;
  gapPx: number;
  marginTop: number;
}) {
  return (
    <div style={{ display: "flex", marginTop }}>
      {capacitySegments(bookedCount, capacity).map((filled, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            flex: 1,
            height: heightPx,
            marginLeft: i === 0 ? 0 : gapPx,
            borderRadius: 4,
            backgroundColor: filled ? color : COLORS.surfaceSeg,
          }}
        />
      ))}
    </div>
  );
}
