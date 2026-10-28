import { cache } from "react";
import { STABLE_TAGS, stableRead } from "@/lib/db/stableRead";
import { VENUE_PHOTOS_BUCKET } from "@/lib/storage/avatar";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";

/**
 * When each venue photograph's BYTES last changed, keyed by `image_path`
 * (round 41, the owner's "venue picture doesn't update").
 *
 * THE BUG. `set_venue_photo` derives `venues/<venue id>.<ext>`, so replacing a
 * photo writes new bytes to the SAME URL — and `next.config.ts` keeps an
 * optimized image for `minimumCacheTTL: 31536000`, a year. Avatars survive
 * that because their URL carries `?v=<players.updated_at>`; venue photos had
 * no version at all, so a replacement was stored correctly (production showed
 * three objects re-uploaded on 2026-10-27, `updated_at` moved on each) and
 * never shown.
 *
 * THE VERSION IS THE OBJECT'S OWN `updated_at`, read from Storage rather than
 * from a column. It is the ground truth — it moves exactly when the bytes do,
 * whoever wrote them — and it needs no migration, so the fix is live the
 * moment it deploys. One listing answers for every venue.
 *
 * CACHED LIKE EVERY SHARED READ (`stableRead`: sixty seconds, keyed on the
 * build, tagged). The uploader does not wait those sixty seconds:
 * `venuePhotoChangedAction` expires the tag the moment an upload lands.
 *
 * THE SERVICE-ROLE CLIENT, because a cached answer is shared by everyone and
 * may not come from a cookie-bound session — and the bucket is public, so the
 * listing reveals nothing the URLs do not.
 */
const readVersions = stableRead(
  ["venue_photo_versions"],
  STABLE_TAGS.venuePhotos,
  async (): Promise<Record<string, string>> => {
    try {
      const supabase = createServiceRoleSupabaseClient();
      const { data, error } = await supabase.storage
        .from(VENUE_PHOTOS_BUCKET)
        .list("venues", { limit: 1000 });
      if (error || !data) return {};

      const versions: Record<string, string> = {};
      for (const object of data) {
        const stamp = object.updated_at ?? object.created_at;
        if (stamp) versions[`venues/${object.name}`] = stamp;
      }
      return versions;
    } catch {
      // No version is the old behaviour, not a broken page.
      return {};
    }
  },
);

/** One listing per request, however many cards render. */
const versionsForRequest = cache(() => readVersions());

/**
 * The version suffix for one venue photo, or null for a committed repo asset
 * (`/venues/x.jpg` — its URL changes with the deploy) and for no photo.
 */
export async function venuePhotoVersion(
  imagePath: string | null | undefined,
): Promise<string | null> {
  if (!imagePath?.startsWith("venues/")) return null;
  const versions = await versionsForRequest();
  return versions[imagePath] ?? null;
}
