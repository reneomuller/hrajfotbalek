import { ImageResponse } from "next/og";
import tailwindConfig from "@/tailwind.config";
import { formatCzk, formatGameDateTime } from "@/lib/format";
import { strings } from "@/lib/strings";

/**
 * Open Graph share card — the volt-on-black preview WhatsApp renders.
 *
 * Game links are shared almost exclusively in WhatsApp, so this is an
 * acquisition surface rather than decoration.
 *
 * COLOURS COME FROM `tailwind.config.ts`, read at module load. Satori (which
 * backs `ImageResponse`) does not run Tailwind, so the classes used elsewhere
 * are unavailable here and the values must be inlined — but they are inlined
 * FROM THE TOKEN TABLE, not retyped. A theme change therefore moves this card
 * with it, which is the property the no-inline-hex rule exists to protect.
 */
const themeColors = (tailwindConfig.theme?.extend?.colors ?? {}) as Record<string, string>;

const COLORS = {
  volt: themeColors.volt,
  ink: themeColors.ink,
  bone: themeColors.bone,
  muted: themeColors.muted,
  hairline: "rgba(255,255,255,.12)",
};

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

export interface ShareImageProps {
  venue: string;
  startsAt: string;
  spotsLeft: number;
  priceCzk: number;
  isFull?: boolean;
}

/**
 * Renders the share card.
 *
 * `venue` is interpolated as a JSX text child, which Satori treats as text —
 * it is never parsed as markup. This is a third escaping grammar alongside
 * HTML and iCalendar, and it is handled by construction here rather than by a
 * shared "sanitize" helper, because the three are not interchangeable.
 */
export function renderShareImage({
  venue,
  startsAt,
  spotsLeft,
  priceCzk,
  isFull = false,
}: ShareImageProps): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: COLORS.ink,
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 12,
              border: `3px solid ${COLORS.volt}`,
              color: COLORS.volt,
              fontSize: 30,
              fontWeight: 800,
            }}
          >
            HF
          </div>
          {/*
            Satori requires an explicit `display` on any element with more
            than one child — it does not apply the browser's default block
            layout. A missing one fails the render outright rather than
            degrading, so every multi-child node here declares it.
          */}
          <div
            style={{
              display: "flex",
              gap: 10,
              color: COLORS.bone,
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: 2,
            }}
          >
            <span>{strings.brand.wordmarkLead}</span>
            <span style={{ color: COLORS.volt }}>{strings.brand.wordmarkAccent}</span>
          </div>
        </div>

        {/* Venue + time */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              color: "#FFFFFF",
              fontSize: 76,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -1,
              // Long venue names must not push the time block off-card.
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {venue}
          </div>
          <div style={{ color: COLORS.volt, fontSize: 40, fontWeight: 700 }}>
            {formatGameDateTime(startsAt)}
          </div>
        </div>

        {/* Spots + price */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `2px solid ${COLORS.hairline}`,
            paddingTop: 32,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              color: isFull ? COLORS.muted : COLORS.volt,
              fontSize: 34,
              fontWeight: 700,
            }}
          >
            {isFull
              ? strings.games.full
              : `${spotsLeft} ${
                  spotsLeft === 1 ? strings.games.spotLeft : strings.games.spotsLeft
                }`}
          </div>
          <div style={{ color: COLORS.muted, fontSize: 34 }}>
            {formatCzk(priceCzk)}
          </div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
