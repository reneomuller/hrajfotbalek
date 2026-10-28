import { cache } from "react";
import { STABLE_TAGS, stableRead } from "@/lib/db/stableRead";
import { PROFILE_PHOTOS_BUCKET, VENUE_PHOTOS_BUCKET } from "@/lib/storage/avatar";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";

/**
 * WHEN EACH PHOTOGRAPH'S BYTES LAST CHANGED, keyed by its storage path — the
 * version every photo URL carries (`?v=`), venue and profile alike.
 *
 * WHY A VERSION AT ALL. Uploads REPLACE in place: `set_venue_photo` writes
 * `venues/<id>.<ext>`, `set_profile_photo` writes `players/<id>.<ext>`, the
 * same key every time. And `next.config.ts` keeps an optimized image for a
 * year (`minimumCacheTTL`), keyed by the URL. So an unversioned photo URL is
 * a year-long promise to show whatever that key held the first time it was
 * optimized at that width. Round 41 found it twice: the owner's "venue picture
 * doesn't update", and then a friend who saw his old face on every roster
 * while everyone else saw the new one — his phone's widths had been cached
 * before the change, theirs had not.
 *
 * THE OBJECT'S OWN `updated_at` IS THE VERSION, read from Storage — it moves
 * exactly when the bytes do, whoever wrote them, and needs no migration. One
 * listing per bucket folder answers for every photo on a page.
 *
 * AND THE VERSION ALONE IS NOT ENOUGH — see `PhotoUpload`'s `cacheControl`.
 * Supabase's storage CDN IGNORES THE QUERY STRING (measured 2026-10-28: a
 * never-seen `?v=` came back `cf-cache-status: HIT`), so a new version fetched
 * while the CDN still held the old bytes would be cached wrong for a year.
 * Uploads therefore go out with no CDN caching.
 *
 * CACHED LIKE EVERY SHARED READ (`stableRead`: sixty seconds, keyed on the
 * build, tagged); an upload expires its tag at once. The service-role client,
 * because a cached answer is shared — and both buckets are public, so the
 * listing reveals nothing the URLs do not.
 */
function listing(bucket: string, folder: string, tag: string) {
  return stableRead([`photo_versions:${bucket}:${folder}`], tag, async (): Promise<Record<string, string>> => {
    try {
      const supabase = createServiceRoleSupabaseClient();
      const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: 1000 });
      if (error || !data) return {};
      const versions: Record<string, string> = {};
      for (const object of data) {
        const stamp = object.updated_at ?? object.created_at;
        if (stamp) versions[`${folder}/${object.name}`] = stamp;
      }
      return versions;
    } catch {
      // No version is the old behaviour, not a broken page.
      return {};
    }
  });
}

const venueVersions = cache(listing(VENUE_PHOTOS_BUCKET, "venues", STABLE_TAGS.venuePhotos));
const profileVersions = cache(listing(PROFILE_PHOTOS_BUCKET, "players", STABLE_TAGS.profilePhotos));

/**
 * The version for a venue photo, or null for a committed repo asset
 * (`/venues/x.jpg` — its URL moves with the deploy) and for no photo.
 */
export async function venuePhotoVersion(imagePath: string | null | undefined): Promise<string | null> {
  if (!imagePath?.startsWith("venues/")) return null;
  return (await venueVersions())[imagePath] ?? null;
}

/** The version for a profile photo or cover (`players/…`), or null. */
export async function profilePhotoVersion(path: string | null | undefined): Promise<string | null> {
  if (!path?.startsWith("players/")) return null;
  return (await profileVersions())[path] ?? null;
}
