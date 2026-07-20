import { getNextGame } from "@/lib/games/queries";
import { OG_CONTENT_TYPE, OG_SIZE, renderShareImage } from "@/lib/og/shareImage";
import { strings } from "@/lib/strings";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = strings.meta.title;

export const dynamic = "force-dynamic";

/** Landing card — leads with the next match when there is one. */
export default async function LandingOpenGraphImage() {
  const next = await getNextGame();

  if (!next) {
    return renderShareImage({
      venue: strings.meta.title,
      startsAt: new Date().toISOString(),
      spotsLeft: 0,
      priceCzk: 0,
      isFull: true,
    });
  }

  return renderShareImage({
    venue: next.game.venue,
    startsAt: next.game.starts_at,
    spotsLeft: next.spotsLeft,
    priceCzk: next.game.price_czk,
    isFull: next.spotsLeft === 0,
  });
}
