import { ImageResponse } from "next/og";
import sharp from "sharp";
import { formatGameDate, formatTime } from "@/lib/format";
import type { GameStoryProps } from "@/lib/og/storyImage";
import { BrandPill, CapacityBar, DISPLAY_FONT, FactTiles, TEXT_FONT, TONE_COLOR, storyFonts, type TileSizes } from "@/lib/og/storyKit";
import { COLORS, OG_SIZE } from "@/lib/og/theme";

/**
 * A game's link preview — what WhatsApp draws above a shared game link — as
 * the 9:16 story laid on its side (2026-11-17, the owner: "update these to
 * better reflect the instagram visual ... every time the link gets shared, it
 * gets shared with the news visual fitted to the whatsapp preview").
 *
 * THE STORY'S PARTS, IN A 1200×630 FRAME (`storyKit.tsx`): the pill, the volt
 * date over the venue in Anton capitals, the format and length tiles, and
 * "x volných míst" over one notch per spot — nothing at all while nobody has
 * booked, as on the story. The venue's photo fills the upper right and fades
 * into ink under the words, the way the story's fades under its facts; a venue
 * with no photo gets pitch lines.
 *
 * Game links are shared almost exclusively in WhatsApp, so this is an
 * acquisition surface rather than decoration: for most arrivals it is the first
 * time they see the brand at all.
 *
 * `venueName` is a JSX text child, which Satori treats as text — it is never
 * parsed as markup.
 */
export { OG_SIZE } from "@/lib/og/theme";

/** Served as a JPEG: see `toShareJpeg`. */
export const SHARE_CONTENT_TYPE = "image/jpeg";

export type ShareImageProps = Omit<GameStoryProps, "address">;

const PAD_X = 56;
const PAD_Y = 48;
/** The photo's box: the card's right-hand 860px, so the frame's middle — where the owner crops the pitch — sits in the clear part. */
export const SHARE_PHOTO_SIZE = { width: 860, height: OG_SIZE.height };
const PHOTO_LEFT = OG_SIZE.width - SHARE_PHOTO_SIZE.width;
/** Half the story's mark: the pill reads at chat size without crowding the venue. */
const MARK_PX = 64;

/** The widest the venue name may run, and the sizes it is drawn between. */
const VENUE_MAX_W = 820;
const VENUE_MAX_PX = 112;
const VENUE_MIN_PX = 64;
/** Anton capitals average under half an em; a little over, so a guess never overruns. */
const ANTON_EM_PER_CHAR = 0.5;
/**
 * Between the date and the venue, MEASURED FROM THE TOP OF AN ACCENT (the
 * owner, 2026-11-17: the "special characters" should have "the same amount of
 * room" under the date that a plain capital had, "for all to remain
 * consistent"). The room a capital had is the story's 18px at 140, in
 * proportion; Anton's accents over a capital stand ANTON_ACCENT_RISE_EM above
 * it (measured: 26px at 112, with a loose line height to rule out clipping —
 * their tops are flat by design). So the date sits that much higher for every
 * name, accented or not.
 */
const CAPITAL_ROOM_EM = 0.14;
const ANTON_ACCENT_RISE_EM = 0.232;
const VENUE_GAP_EM = CAPITAL_ROOM_EM + ANTON_ACCENT_RISE_EM;

const TILES: TileSizes = { labelPx: 22, labelTracking: 2, valuePx: 50, padY: 12, padX: 20, radius: 18, gap: 14 };
const TILE_MIN_W = 196;

/**
 * The venue's size: as large as fits on one line, never smaller than
 * `VENUE_MIN_PX` — below that a long name wraps instead.
 */
export function venueFontPx(name: string): number {
  const fit = Math.floor(VENUE_MAX_W / (Math.max(1, name.length) * ANTON_EM_PER_CHAR));
  return Math.min(VENUE_MAX_PX, Math.max(VENUE_MIN_PX, fit));
}

/** Pitch lines for a venue with no photo, in the brand card's hand. */
function pitchFallbackDataUri(): string {
  const { width: w, height: h } = SHARE_PHOTO_SIZE;
  const cy = h / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="${w}" height="${h}" fill="${COLORS.ink}"/>
<g fill="none" stroke="${COLORS.volt}" stroke-opacity=".34" stroke-width="3">
<rect x="-40" y="40" width="${w}" height="${h - 80}"/>
<circle cx="200" cy="${cy}" r="110"/>
<line x1="200" y1="40" x2="200" y2="${h - 40}"/>
<rect x="${w - 40 - 170}" y="${cy - 180}" width="170" height="360"/>
<rect x="${w - 40 - 64}" y="${cy - 80}" width="64" height="160"/>
<path d="M ${w - 210} ${cy - 70} A 110 110 0 0 0 ${w - 210} ${cy + 70}"/>
</g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function renderShareImage(props: ShareImageProps): ImageResponse {
  const { venueName, startsAt, facts, availability, bookedCount, capacity, photoDataUri, locale, t } = props;
  const upper = (text: string) => text.toLocaleUpperCase(locale);
  const venue = upper(venueName);
  const venuePx = venueFontPx(venue);

  const when = `${upper(formatGameDate(startsAt, locale))} · ${formatTime(startsAt, locale)}`;
  const tone = availability ? TONE_COLOR[availability.tone] : COLORS.volt;
  const layer = { position: "absolute", top: 0, left: 0, width: OG_SIZE.width, height: OG_SIZE.height } as const;

  return new ImageResponse(
    (
      <div style={{ ...layer, display: "flex", backgroundColor: COLORS.ink, fontFamily: TEXT_FONT }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoDataUri ?? pitchFallbackDataUri()}
          width={SHARE_PHOTO_SIZE.width}
          height={SHARE_PHOTO_SIZE.height}
          style={{ position: "absolute", top: 0, left: PHOTO_LEFT, objectFit: "cover" }}
          alt=""
        />
        {/* Ink under the words at the left, clear at the right… */}
        <div
          style={{
            ...layer,
            display: "flex",
            backgroundImage: `linear-gradient(to right, ${COLORS.ink} 0%, ${COLORS.ink} 30%, rgba(8,8,8,.6) 50%, rgba(8,8,8,0) 70%)`,
          }}
        />
        {/* …and ink at the foot, where the tiles and the bar stand — the story's fade. */}
        <div
          style={{
            ...layer,
            display: "flex",
            backgroundImage: `linear-gradient(to bottom, rgba(8,8,8,0) 0%, rgba(8,8,8,0) 42%, ${COLORS.ink} 80%)`,
          }}
        />

        <div
          style={{
            ...layer,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: `${PAD_Y}px ${PAD_X}px`,
          }}
        >
          <BrandPill markPx={MARK_PX} t={t} upper={upper} />

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontFamily: DISPLAY_FONT, fontSize: 40, lineHeight: 1.1, color: COLORS.volt, letterSpacing: 1 }}>
              {when}
            </div>
            <div
              style={{
                display: "flex",
                maxWidth: VENUE_MAX_W,
                marginTop: Math.round(venuePx * VENUE_GAP_EM),
                fontFamily: DISPLAY_FONT,
                fontSize: venuePx,
                lineHeight: 0.98,
                color: "white",
              }}
            >
              {venue}
            </div>

            {/* One row: the format and the length, then the count over the bar. */}
            <div style={{ display: "flex", alignItems: "flex-end", marginTop: 30 }}>
              <FactTiles facts={facts} sizes={TILES} upper={upper} tileMinWidth={TILE_MIN_W} />
              {availability && (
                <div style={{ display: "flex", flexDirection: "column", flex: 1, marginLeft: 36 }}>
                  <div style={{ display: "flex", fontFamily: DISPLAY_FONT, fontSize: 40, lineHeight: 1.1, color: tone }}>
                    {upper(availability.label)}
                  </div>
                  <CapacityBar bookedCount={bookedCount} capacity={capacity} color={tone} heightPx={14} gapPx={6} marginTop={12} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: storyFonts() },
  );
}

/**
 * WhatsApp shows no picture at all for an image it thinks too heavy — widely
 * reported at around 300 KB, and nowhere documented. The old card was flat
 * colour and weighed little as a PNG; with a photograph a PNG runs to a
 * megabyte, so the card goes out as a JPEG.
 */
export const SHARE_IMAGE_BUDGET_BYTES = 300 * 1024;

/**
 * The card as a JPEG. Full-resolution colour (4:4:4) because the volt words on
 * ink are what the card is for, and halving the colour resolution smears them.
 */
export async function toShareJpeg(image: Response): Promise<Buffer> {
  return sharp(Buffer.from(await image.arrayBuffer()))
    .jpeg({ quality: 84, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toBuffer();
}
