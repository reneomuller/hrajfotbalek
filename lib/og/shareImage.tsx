import { ImageResponse } from "next/og";
import { OG_MARK_DATA_URI } from "@/lib/og/mark";
import tailwindConfig from "@/tailwind.config";
import { formatCzk, formatGameDateTime } from "@/lib/format";
import { pluralise } from "@/lib/i18n/plural";
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
          {/*
            THE MARK, not a `HF` in a volt-bordered box.

            The box was a stand-in from before there was artwork, and it was
            the wrong stand-in in the one place it matters most: this card is
            what WhatsApp draws when somebody shares a game, which for most
            arrivals is the first time they see the brand at all. A mark that
            does not match the header they land on is two brands.

            `OG_MARK_DATA_URI` is the bytes, generated from the same 512px
            master as the favicon and the home-screen icon — see `lib/og/mark.ts`
            for why Satori is handed a string here rather than a path.

            `borderRadius: 28` is half of 56 — the master carries a baked-in
            black square behind the roundel, and on an ink card the corners are
            invisible right up until a viewer's client composites the preview
            onto white.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={OG_MARK_DATA_URI} width={56} height={56} style={{ borderRadius: 28 }} alt="" />
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
            {/*
              ENGLISH, EXPLICITLY. This card is rendered for a link preview,
              which no locale cookie reaches — `strings` is the English table
              and "en" is the language its plurals must agree with.
            */}
            {isFull
              ? strings.games.full
              : pluralise(
                  {
                    one: strings.games.spotsLeftOne,
                    few: strings.games.spotsLeftFew,
                    many: strings.games.spotsLeftMany,
                  },
                  spotsLeft,
                  "en",
                )}
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
