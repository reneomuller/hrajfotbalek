import { getGameById, getVenue } from "@/lib/games/queries";
import { resolveStrings } from "@/lib/i18n/resolve";
import { getLocale } from "@/lib/i18n/server";
import { renderBrandImage } from "@/lib/og/brandImage";
import { SHARE_PHOTO_SIZE, renderShareImage, toShareJpeg } from "@/lib/og/shareImage";
import { storyAvailability, storyFacts } from "@/lib/og/storyFacts";
import { venuePhotoDataUri } from "@/lib/og/venuePhoto";

/**
 * Everything a game's link preview needs, gathered and drawn, as JPEG bytes
 * (2026-11-17).
 *
 * THE PUBLIC READS THE GAME PAGE MAKES — `getGameById` and `getVenue`, as
 * whoever is asking, which for a link preview is nobody. The count is the
 * page's own (a seat per roster row, guests included), so the preview and the
 * page it opens never disagree about how many places are left.
 *
 * IN THE LANGUAGE OF THE TITLE BESIDE IT: the page's `generateMetadata` and
 * this image resolve the same request's language the same way (`getLocale` —
 * the cookie, then `Accept-Language`, then Czech), so one preview never shows
 * a Czech picture over a Russian line.
 *
 * A GAME THE READ CANNOT SEE — a draft, or a link to something deleted —
 * still gets a picture, because the link may already be pasted somewhere:
 * the brand card every other page shows.
 */
export async function buildGameShareJpeg(ref: string): Promise<Buffer> {
  const result = await getGameById(ref);
  if (!result) return toShareJpeg(renderBrandImage());

  const { game, bookedCount } = result;
  const [venue, locale] = await Promise.all([getVenue(game.venue_id), getLocale()]);
  const t = resolveStrings(locale);

  const image = renderShareImage({
    venueName: venue?.name ?? game.venue,
    startsAt: game.starts_at,
    facts: storyFacts({ format: game.format, durationMinutes: game.duration_minutes }, t),
    availability: storyAvailability({ bookedCount, capacity: game.capacity }, locale, t),
    bookedCount,
    capacity: game.capacity,
    photoDataUri: await venuePhotoDataUri(venue?.image_path ?? null, SHARE_PHOTO_SIZE),
    locale,
    t,
  });
  return toShareJpeg(image);
}
