import { ImageResponse } from "next/og";
import { formatGameDate, formatTime, type DateLocale } from "@/lib/format";
import type { SpotsTone } from "@/lib/games/urgency";
import type { StoryFact } from "@/lib/og/storyFacts";
import { BrandPill, CapacityBar, DISPLAY_FONT, FactTiles, STORY_TILES, TEXT_FONT, TONE_COLOR, storyFonts } from "@/lib/og/storyKit";
import { COLORS } from "@/lib/og/theme";
import type { Strings } from "@/lib/strings";

/**
 * A game as a 9:16 story image, 1080×1920, for an admin to post (2026-11-06,
 * the owner: "download an image in 9:16 (1080x1920) of the game ... with the
 * pitch picture and necessary info").
 *
 * THE LOGO SITS BELOW INSTAGRAM'S TOP ~200px (progress bar, account), on a
 * dark pill so the photo cannot swallow it. The game's facts start where the
 * photo fades, high enough to leave the foot of the frame free: the link goes
 * there by hand when posting, as a sticker. No call to action is printed —
 * the owner removed it on the third draft.
 *
 * THE PHOTO IS THE VENUE'S, cropped to cover the top half and fading into
 * ink — the game page's hero, stood on end. A venue with no photo gets the
 * pitch lines instead, never a stock picture of somewhere else.
 *
 * AVAILABILITY IS THE APP'S: "x volných míst" above the capacity bar, in the
 * same tone ladder — and nothing at all while nobody has booked
 * (`storyAvailability`).
 *
 * THE PARTS ARE SHARED WITH THE LINK PREVIEW (`storyKit.tsx`, 2026-11-17):
 * the pill, the tiles, the bar and the fonts, so the WhatsApp preview of a game
 * is this image laid on its side.
 */

export const STORY_SIZE = { width: 1080, height: 1920 };
const PAD = 72;
const PHOTO_HEIGHT = 1000;
/** The size the venue photo is drawn at, so it is fetched at no more. */
export const STORY_PHOTO_SIZE = { width: STORY_SIZE.width, height: PHOTO_HEIGHT };
const SAFE_TOP = 200;
/** Where the game's facts begin: on the photo's fade, so the two read as one. */
const FACTS_TOP = 640;
const MARK_PX = 128;

export interface GameStoryProps {
  venueName: string;
  /** "Dubečská 9, Praha 10" — the venue's address line, or null. */
  address: string | null;
  startsAt: string;
  facts: StoryFact[];
  /** "6 volných míst" and its tone, or null while nobody has booked. */
  availability: { label: string; tone: SpotsTone } | null;
  bookedCount: number;
  capacity: number;
  /** The venue photo as a JPEG/PNG data URI (the renderer cannot decode WebP), or null. */
  photoDataUri: string | null;
  locale: DateLocale;
  t: Strings;
}

/** Vertical pitch lines for a venue with no photo, in the brand card's hand. */
function pitchFallbackDataUri(): string {
  const w = STORY_SIZE.width;
  const h = PHOTO_HEIGHT;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="${w}" height="${h}" fill="${COLORS.ink}"/>
<g fill="none" stroke="${COLORS.volt}" stroke-opacity=".3" stroke-width="3">
<rect x="90" y="-40" width="${w - 180}" height="${h + 80}"/>
<line x1="90" y1="${h / 2}" x2="${w - 90}" y2="${h / 2}"/>
<circle cx="${w / 2}" cy="${h / 2}" r="150"/>
<rect x="${w / 2 - 260}" y="-40" width="520" height="260"/>
</g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function renderGameStory(props: GameStoryProps): ImageResponse {
  const { venueName, address, startsAt, facts, availability, bookedCount, capacity, photoDataUri, locale, t } = props;
  const upper = (text: string) => text.toLocaleUpperCase(locale);

  const when = `${upper(formatGameDate(startsAt, locale))} · ${formatTime(startsAt, locale)}`;
  const tone = availability ? TONE_COLOR[availability.tone] : COLORS.volt;
  const full = { position: "absolute", top: 0, left: 0 } as const;

  return new ImageResponse(
    (
      <div
        style={{
          ...full,
          width: STORY_SIZE.width,
          height: STORY_SIZE.height,
          display: "flex",
          backgroundColor: COLORS.ink,
          fontFamily: TEXT_FONT,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoDataUri ?? pitchFallbackDataUri()}
          width={STORY_SIZE.width}
          height={PHOTO_HEIGHT}
          style={{ ...full, objectFit: "cover" }}
          alt=""
        />
        {/* Dark under the logo, clear in the middle, ink at the foot. */}
        <div
          style={{
            ...full,
            width: STORY_SIZE.width,
            height: PHOTO_HEIGHT,
            display: "flex",
            backgroundImage: `linear-gradient(to bottom, rgba(8,8,8,.55) 0%, rgba(8,8,8,0) 24%, rgba(8,8,8,0) 38%, ${COLORS.ink} 88%)`,
          }}
        />

        <div
          style={{
            ...full,
            width: STORY_SIZE.width,
            height: STORY_SIZE.height,
            display: "flex",
            flexDirection: "column",
            paddingTop: SAFE_TOP,
            paddingLeft: PAD,
            paddingRight: PAD,
          }}
        >
          {/* The mark and the wordmark, the header's pairing — large enough to
              be read at a glance, which the first draft's was not. */}
          <BrandPill markPx={MARK_PX} t={t} upper={upper} />

          <div style={{ display: "flex", flexDirection: "column", marginTop: FACTS_TOP - SAFE_TOP - (MARK_PX + 24) }}>
            <div style={{ display: "flex", fontFamily: DISPLAY_FONT, fontSize: 64, color: COLORS.volt, letterSpacing: 1 }}>
              {when}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 18,
                fontFamily: DISPLAY_FONT,
                fontSize: 140,
                lineHeight: 0.98,
                color: "white",
              }}
            >
              {upper(venueName)}
            </div>
            {address && (
              <div style={{ display: "flex", alignItems: "center", marginTop: 26 }}>
                <svg width="34" height="44" viewBox="0 0 24 31" style={{ marginRight: 16 }}>
                  <path
                    d="M12 0C5.4 0 0 5.3 0 11.9 0 20.8 12 31 12 31s12-10.2 12-19.1C24 5.3 18.6 0 12 0zm0 16.6a4.7 4.7 0 1 1 0-9.4 4.7 4.7 0 0 1 0 9.4z"
                    fill={COLORS.volt}
                  />
                </svg>
                <span style={{ fontSize: 48, color: COLORS.bone }}>{address}</span>
              </div>
            )}

            {/* One row: the format and the length. */}
            <FactTiles facts={facts} sizes={STORY_TILES} upper={upper} marginTop={64} />

            {/* Availability, the app's way: the count above the bar. */}
            {availability && (
              <div style={{ display: "flex", marginTop: 52, fontFamily: DISPLAY_FONT, fontSize: 64, color: tone }}>
                {upper(availability.label)}
              </div>
            )}
            {availability && (
              <CapacityBar bookedCount={bookedCount} capacity={capacity} color={tone} heightPx={18} gapPx={8} marginTop={20} />
            )}

          </div>

        </div>
      </div>
    ),
    { ...STORY_SIZE, fonts: storyFonts() },
  );
}
