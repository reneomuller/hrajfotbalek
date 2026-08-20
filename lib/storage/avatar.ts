/**
 * Where an avatar comes from, and what to show when there is not one.
 *
 * THE FALLBACK IS NOT AN ERROR STATE. Most players will never upload a photo,
 * and the initials avatar is what the product has always shown — Phase 2 adds
 * an option, not an expectation. So the absent case is the ordinary one here
 * and gets the same care as the present one.
 */

export const PROFILE_PHOTOS_BUCKET = "profile-photos";

/** The three the bucket accepts, mapped to the extension the key uses. */
export const ACCEPTED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** 2 MiB, matching `storage.buckets.file_size_limit` on the bucket itself. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

/** The side length every upload is cropped to before it leaves the browser. */
export const AVATAR_SIDE_PX = 512;

/*
 * THE COVER'S ENCODE SIZE (round 8, item 10).
 *
 * The band renders 390x132 on a phone and full-width on a desktop, so 1200x400
 * is roughly 3x the phone and about 1.2x the widest realistic render — enough
 * that it never looks soft, small enough to stay far under the bucket's 2 MiB.
 * The 3:1 ratio is the band's own: cropping to it in the browser means the
 * player sees at upload time what the page will show, rather than discovering
 * that `object-cover` took the middle of their photograph.
 */
export const COVER_WIDTH_PX = 1200;
export const COVER_HEIGHT_PX = 400;

export function extensionForMimeType(mimeType: string): string | null {
  return ACCEPTED_IMAGE_TYPES[mimeType] ?? null;
}

/**
 * The public URL for a stored object.
 *
 * Built rather than fetched: the bucket is public, so the URL is a pure
 * function of the base URL and the key, and asking the client library for it
 * would be a round trip to compute a string.
 *
 * A CACHE-BUSTING SUFFIX IS REQUIRED, not cosmetic. The object key is derived
 * from the player id and never changes, so a re-upload replaces the bytes at a
 * URL the browser and the CDN have already cached — and the player sees their
 * old face and concludes the upload failed. `updatedAt` moves whenever the row
 * does, which is exactly when the bytes changed.
 */
export function avatarUrl(
  supabaseUrl: string,
  photoPath: string | null | undefined,
  updatedAt?: string | null,
): string | null {
  if (!photoPath) return null;
  const base = supabaseUrl.replace(/\/$/, "");
  const url = `${base}/storage/v1/object/public/${PROFILE_PHOTOS_BUCKET}/${photoPath}`;
  return updatedAt ? `${url}?v=${encodeURIComponent(updatedAt)}` : url;
}

export interface PhotoRejection {
  reason: "type" | "size";
}

/**
 * Whether a chosen file is worth sending.
 *
 * The bucket enforces both of these too, and that is the enforcement — this is
 * the part that tells someone what went wrong before they spend a slow mobile
 * upload finding out. Client checks are a courtesy; the reason they are not
 * security is that anything can call the API directly, which is why the bucket
 * carries the same limits.
 */
export function rejectPhoto(file: { type: string; size: number }): PhotoRejection | null {
  if (!extensionForMimeType(file.type)) return { reason: "type" };
  if (file.size > MAX_PHOTO_BYTES) return { reason: "size" };
  return null;
}

export const VENUE_PHOTOS_BUCKET = "venue-photos";

/**
 * The renderable URL for a venue's `image_path`, whichever shape it is.
 *
 * TWO SHAPES, ONE READER (migration 34):
 *   `/venues/x.jpg`        a committed repo asset — served by Next from
 *                          `public/`, so the path IS the URL
 *   `venues/<uuid>.jpg`    a key in the venue-photos bucket
 *
 * The leading slash is the discriminator, which is why the CHECK constraint
 * anchors both patterns rather than accepting anything image-shaped. Anything
 * that is neither returns null and the panel falls back to name + Open map —
 * the correct behaviour for a value that should not be in the column.
 */
export function venuePhotoUrl(
  supabaseUrl: string,
  imagePath: string | null | undefined,
): string | null {
  if (!imagePath) return null;

  if (imagePath.startsWith("/venues/")) return imagePath;

  if (imagePath.startsWith("venues/")) {
    if (!supabaseUrl) return null;
    const base = supabaseUrl.replace(/\/$/, "");
    return `${base}/storage/v1/object/public/${VENUE_PHOTOS_BUCKET}/${imagePath}`;
  }

  return null;
}
