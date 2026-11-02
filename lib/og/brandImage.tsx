import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { resolveStrings } from "@/lib/i18n/resolve";
import { COLORS, OG_SIZE } from "@/lib/og/theme";

/**
 * The brand share card — what a link to the site, or to any page without a
 * card of its own, shows in WhatsApp (2026-11-02).
 *
 * IT REPLACED "THE NEXT GAME". The root card used to lead with whichever game
 * came next, so a link to the home page previewed as one particular evening at
 * one particular pitch. Game links keep that card (`app/game/[id]`), which is
 * where it is the right answer.
 *
 * THE OWNER PICKED DRAFT C, "KICK-OFF", WITH DRAFT B'S LEFT ALIGNMENT: the mark
 * on the centre spot of a top-down pitch, the hero's two lines either side of
 * halfway, every line flush left. The mark sits dead centre on purpose —
 * WhatsApp sometimes previews a link as a small square cut from the middle,
 * and this is the one layout of the three where that square still shows the
 * brand. `lib/og/__tests__/brandImage.test.ts` decodes both properties.
 *
 * IN THE DEFAULT LOCALE, because that is the language the home page's title
 * and description reach a link preview in — no locale cookie travels with a
 * crawler.
 *
 * RENDERED AT BUILD (`force-static` on the route), which is what makes the two
 * file reads below safe: `lib/og/mark.ts` explains why a request-time read of
 * `public/` is not. The font is Anton, the hero's display face, under the SIL
 * Open Font License (`lib/og/fonts/OFL.txt`); the mark is the 512px master,
 * because the 112px copy in `mark.ts` would be upscaled to twice its size.
 */

/** The mark's diameter: it fills the centre circle. */
export const BRAND_MARK_PX = 236;
/** Each block's share of the width either side of the mark. */
const SIDE_BLOCK_PX = 400;
/** Space between the mark and the words either side of it. */
const SIDE_GAP_PX = 36;
const HERO_FONT_PX = 104;

/** A top-down pitch in volt hairlines over mowing stripes, as on the home page. */
function pitchDataUri(): string {
  const { width: W, height: H } = OG_SIZE;
  const inset = 36;
  const [l, t, r, b, cy] = [inset, inset, W - inset, H - inset, H / 2];
  const stripes = Array.from({ length: 12 }, (_, i) =>
    i % 2 ? `<rect x="${i * 100}" y="0" width="100" height="${H}" fill="${COLORS.bone}" fill-opacity=".03"/>` : "",
  ).join("");
  const box = (x: number, w: number, h: number) =>
    `<rect x="${x}" y="${cy - h / 2}" width="${w}" height="${h}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${COLORS.ink}"/>${stripes}
<g fill="none" stroke="${COLORS.volt}" stroke-opacity=".34" stroke-width="2">
<rect x="${l}" y="${t}" width="${r - l}" height="${b - t}"/>
<line x1="${W / 2}" y1="${t}" x2="${W / 2}" y2="${b}"/>
<circle cx="${W / 2}" cy="${cy}" r="96"/>
${box(l, 150, 330)}${box(r - 150, 150, 330)}${box(l, 56, 150)}${box(r - 56, 56, 150)}
<path d="M ${l + 150} ${cy - 62} A 96 96 0 0 1 ${l + 150} ${cy + 62}"/>
<path d="M ${r - 150} ${cy - 62} A 96 96 0 0 0 ${r - 150} ${cy + 62}"/>
<path d="M ${l} ${t + 18} A 18 18 0 0 0 ${l + 18} ${t}"/><path d="M ${r - 18} ${t} A 18 18 0 0 0 ${r} ${t + 18}"/>
<path d="M ${l} ${b - 18} A 18 18 0 0 1 ${l + 18} ${b}"/><path d="M ${r - 18} ${b} A 18 18 0 0 1 ${r} ${b - 18}"/>
</g>
<g fill="${COLORS.volt}" fill-opacity=".54"><circle cx="${W / 2}" cy="${cy}" r="4"/><circle cx="${l + 110}" cy="${cy}" r="3"/><circle cx="${r - 110}" cy="${cy}" r="3"/></g>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function renderBrandImage(): ImageResponse {
  const t = resolveStrings(DEFAULT_LOCALE);
  const upper = (text: string) => text.toLocaleUpperCase(DEFAULT_LOCALE);
  // "Hraj fotbal" / "Kdykoli. Kdekoli." — one word to a line, as in the draft.
  const lead = upper(t.landing.heroLine1).split(/\s+/);
  const accent = upper(t.landing.heroLine2).split(/\s+/);

  const anton = readFileSync(join(process.cwd(), "lib/og/fonts/Anton-Regular.ttf"));
  const mark = readFileSync(join(process.cwd(), "public/brand/hf-logo.png")).toString("base64");

  const word = { fontSize: HERO_FONT_PX, lineHeight: 1 };
  const full = { position: "absolute", top: 0, left: 0, width: OG_SIZE.width, height: OG_SIZE.height } as const;

  return new ImageResponse(
    (
      <div style={{ ...full, display: "flex", backgroundColor: COLORS.ink, fontFamily: "Anton" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pitchDataUri()} width={OG_SIZE.width} height={OG_SIZE.height} style={full} alt="" />

        <div style={{ ...full, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {/*
            FLUSH LEFT, HUGGING THE MARK. The outer box holds the left half's
            width and pushes its content to the mark; the inner column
            left-aligns the words with each other — draft B's alignment, which
            is the owner's one change to C.
          */}
          <div style={{ display: "flex", justifyContent: "flex-end", width: SIDE_BLOCK_PX, marginRight: SIDE_GAP_PX }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              {lead.map((text, i) => (
                <div key={text} style={{ ...word, display: "flex", color: "white" }}>
                  <span>{text}</span>
                  {i === lead.length - 1 && <span style={{ color: COLORS.volt }}>.</span>}
                </div>
              ))}
            </div>
          </div>

          {/*
            `borderRadius` is half the size: the master carries a baked-in black
            square behind the roundel, invisible on ink until a client
            composites the preview onto white.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${mark}`}
            width={BRAND_MARK_PX}
            height={BRAND_MARK_PX}
            style={{ borderRadius: BRAND_MARK_PX / 2 }}
            alt=""
          />

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", width: SIDE_BLOCK_PX, marginLeft: SIDE_GAP_PX }}>
            {accent.map((text) => (
              <div key={text} style={{ ...word, display: "flex", color: COLORS.volt }}>
                {text}
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: "absolute", left: 0, bottom: 58, width: OG_SIZE.width, display: "flex", justifyContent: "center" }}>
          <div
            style={{
              display: "flex",
              color: COLORS.muted,
              backgroundColor: COLORS.ink,
              fontSize: 26,
              letterSpacing: 4,
              paddingLeft: 18,
              paddingRight: 18,
            }}
          >
            {upper(t.meta.shareTagline)}
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: [{ name: "Anton", data: anton, weight: 400, style: "normal" }] },
  );
}
