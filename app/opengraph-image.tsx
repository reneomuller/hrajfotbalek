import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { resolveStrings } from "@/lib/i18n/resolve";
import { renderBrandImage } from "@/lib/og/brandImage";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og/theme";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
/** In the card's own language — see `lib/og/brandImage.tsx`. */
export const alt = resolveStrings(DEFAULT_LOCALE).meta.title;

/**
 * Rendered once, at build. The card names no game and reads no data, and its
 * renderer reads two files that are only guaranteed to exist at build time.
 */
export const dynamic = "force-static";

/**
 * The brand card, for the home page and every route without a card of its own
 * (2026-11-02). It used to lead with the next match, so a link to the site
 * previewed as one game; game links keep that card in `app/game/[id]`.
 */
export default function LandingOpenGraphImage() {
  return renderBrandImage();
}
