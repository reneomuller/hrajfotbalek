import tailwindConfig from "@/tailwind.config";

/**
 * What both share cards draw with: the game card (`shareImage.tsx`) and the
 * brand card (`brandImage.tsx`).
 *
 * COLOURS COME FROM `tailwind.config.ts`, read at module load. Satori (which
 * backs `ImageResponse`) does not run Tailwind, so the classes used elsewhere
 * are unavailable here and the values must be inlined — but they are inlined
 * FROM THE TOKEN TABLE, not retyped. A theme change therefore moves the cards
 * with it, which is the property the no-inline-hex rule exists to protect.
 */
const themeColors = (tailwindConfig.theme?.extend?.colors ?? {}) as Record<string, string>;

export const COLORS = {
  volt: themeColors.volt,
  ink: themeColors.ink,
  bone: themeColors.bone,
  muted: themeColors.muted,
  faint: themeColors.faint,
  surface: themeColors.surface,
  surfaceSeg: themeColors["surface-seg"],
  warn: themeColors.warn,
  danger: themeColors.danger,
  hairline: "rgba(255,255,255,.12)",
};

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";
