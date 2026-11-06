import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ImageResponse } from "next/og";
import sharp from "sharp";
import { getAdminGame } from "@/lib/admin/queries";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { resolveStrings } from "@/lib/i18n/resolve";
import { STORY_SIZE, renderGameStory } from "@/lib/og/storyImage";
import { storyAvailability, storyFacts } from "@/lib/og/storyFacts";
import { venuePhotoUrl } from "@/lib/storage/avatar";
import { venuePhotoVersion } from "@/lib/storage/photoVersions";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";

/**
 * Everything a game's 9:16 story needs, gathered and drawn (2026-11-06).
 *
 * SERVICE-ROLE READS, behind the route's `requireAdmin()`: the story is made
 * for any game an admin can open, a draft included, and the counts are the
 * admin's own (`activeCount` — seats, guests included).
 *
 * IN THE SITE'S DEFAULT LANGUAGE (Czech), the language of the people it is
 * posted for; every label is in `lib/strings.ts`, so another is one argument.
 */

/** The photo height the renderer draws; fetched at that size, no larger. */
const PHOTO_HEIGHT = 1000;

/**
 * The venue photo as a JPEG data URI, or null — then the renderer draws the
 * pitch lines. The renderer cannot decode WebP, which is what the uploader
 * stores, so every photo goes through sharp. A photo that cannot be fetched is
 * a story without a photo, not a failed download.
 */
async function photoDataUri(imagePath: string | null): Promise<string | null> {
  if (!imagePath) return null;
  const url = venuePhotoUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    imagePath,
    await venuePhotoVersion(imagePath),
  );
  if (!url) return null;

  try {
    // A repo asset (`/venues/x.jpg`) is on disk beside the code; a bucket key is a URL.
    const source = url.startsWith("/")
      ? readFileSync(join(process.cwd(), "public", url))
      : Buffer.from(await (await fetch(url)).arrayBuffer());
    const jpeg = await sharp(source)
      .resize({ width: STORY_SIZE.width, height: PHOTO_HEIGHT, fit: "cover" })
      .jpeg({ quality: 88 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    // Unreachable storage or an unreadable file: the pitch-lines fallback is
    // the honest picture of "no photo", and the rest of the story still holds.
    return null;
  }
}

export async function buildGameStory(
  gameId: string,
): Promise<{ image: ImageResponse; fileName: string } | null> {
  const game = await getAdminGame(gameId);
  if (!game) return null;

  const service = createServiceRoleSupabaseClient();
  const { data: venue } = game.venue_id
    ? await service.from("venues").select("name, address, image_path").eq("id", game.venue_id).maybeSingle()
    : { data: null };

  const t = resolveStrings(DEFAULT_LOCALE);

  const image = renderGameStory({
    venueName: venue?.name ?? game.venue,
    address: venue?.address ?? null,
    startsAt: game.starts_at,
    facts: storyFacts({ format: game.format, durationMinutes: game.duration_minutes }, t),
    availability: storyAvailability(
      { bookedCount: game.activeCount, capacity: game.capacity },
      DEFAULT_LOCALE,
      t,
    ),
    bookedCount: game.activeCount,
    capacity: game.capacity,
    photoDataUri: await photoDataUri(venue?.image_path ?? null),
    locale: DEFAULT_LOCALE,
    t,
  });

  return { image, fileName: `hraj-fotbal-${game.game_number ?? game.id}-story.png` };
}
