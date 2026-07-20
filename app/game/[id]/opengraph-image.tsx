import { getGameById } from "@/lib/games/queries";
import { OG_CONTENT_TYPE, OG_SIZE, renderShareImage } from "@/lib/og/shareImage";
import { strings } from "@/lib/strings";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = strings.meta.title;

// Spots-left is on the card, so it is rendered per request rather than cached.
export const dynamic = "force-dynamic";

export default async function GameOpenGraphImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getGameById(id);

  // A game the RLS policy hides still needs a card — the link may be pasted
  // anywhere — so fall back to the brand rather than 404ing the image.
  if (!result) {
    return renderShareImage({
      venue: strings.meta.title,
      startsAt: new Date().toISOString(),
      spotsLeft: 0,
      priceCzk: 0,
      isFull: true,
    });
  }

  const { game, spotsLeft } = result;

  return renderShareImage({
    venue: game.venue,
    startsAt: game.starts_at,
    spotsLeft,
    priceCzk: game.price_czk,
    isFull: spotsLeft === 0,
  });
}
