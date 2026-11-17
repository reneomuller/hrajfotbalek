import type { ImageResponse } from "next/og";
import { getAdminGame } from "@/lib/admin/queries";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { resolveStrings } from "@/lib/i18n/resolve";
import { STORY_PHOTO_SIZE, renderGameStory } from "@/lib/og/storyImage";
import { storyAvailability, storyFacts } from "@/lib/og/storyFacts";
import { venuePhotoDataUri } from "@/lib/og/venuePhoto";
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
    photoDataUri: await venuePhotoDataUri(venue?.image_path ?? null, STORY_PHOTO_SIZE),
    locale: DEFAULT_LOCALE,
    t,
  });

  return { image, fileName: `hraj-fotbal-${game.game_number ?? game.id}-story.png` };
}
