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
/*
 * THE CROP FRAME IS THE RENDERED BAND'S ASPECT, MEASURED (round 30, item 7).
 *
 * ~~1200x400, a 3:1 strip.~~ The banner has not rendered at 3:1 since round 9
 * and has never rendered at 3:1 since round 28 made it full-bleed: measured at
 * the canonical 390px viewport it is **390x341, or 1.144:1**. A 3:1 crop
 * dropped into a 1.14:1 box under `object-cover` has its SIDES cut off — so a
 * player framed their banner carefully and the page showed the middle third of
 * what they framed. That is the exact surprise cropping this constant exists
 * to prevent, and it was the constant causing it.
 *
 * 1200 x 1049 is 1.1439; the band is 1.1437. `e2e/crop-frames.spec.ts` pins
 * the two together so they cannot drift apart again.
 *
 * THE ASPECT IS VIEWPORT-DEPENDENT AND 390 IS THE REFERENCE, stated because it
 * is the honest limit of "exactly match": the band's HEIGHT is fixed and its
 * width is the shell's, so a desktop reader sees a wider box. The product is
 * mobile-first, every spec runs at 390, and matching there is matching where
 * the photograph is actually looked at.
 */
export const COVER_WIDTH_PX = 1200;
export const COVER_HEIGHT_PX = 1049;

/**
 * The venue photograph's output (round 30, item 1).
 *
 * ~~16:9.~~ **1.875:1, WHICH IS WHAT THE BAND ACTUALLY RENDERS** (round 30,
 * item 7) — measured at the canonical 390px viewport as 390x208. 16:9 was
 * close enough to look right and wrong enough to crop: a frame taller than its
 * surface means `object-cover` quietly takes a slice off the top and bottom of
 * whatever was composed in it.
 *
 * THE CROP FRAME IS THE SURFACE'S ASPECT, EXACTLY, which is the entire point
 * of cropping in the browser: the organizer standing at the pitch sees what
 * the page will show rather than discovering later that the middle was taken.
 * `e2e/crop-frames.spec.ts` measures the rendered band and fails if these
 * numbers and it ever disagree.
 */
export const VENUE_WIDTH_PX = 1500;
export const VENUE_HEIGHT_PX = 800;

/**
 * THE OUTPUT SIZE OF EVERY CROPPABLE SURFACE, IN ONE PLACE (round 32, item 1).
 *
 * WHY THIS MAP EXISTS, AND IT IS A BUG RATHER THAN TIDINESS. `PhotoUpload`
 * carried the same decision TWICE as two ternaries — one choosing what to
 * encode, one choosing what the cropper draws — and round 30 added a `venue`
 * arm to the first and not the second. So a venue photo was COMPOSED in the
 * avatar's 1:1 window and SAVED at the venue band's 1.875:1: the wide strip
 * was taken out of the middle of a square the organizer had carefully filled.
 * What you framed was emphatically not what you got, and the window looked
 * nothing like the banner's, which is exactly the parity complaint.
 *
 * ONE MAP, READ BY BOTH. A record keyed by the target cannot have a missing
 * arm — TypeScript refuses the object if a target is absent — where a ternary
 * silently falls through to whatever the `else` happens to be.
 */
export const CROP_OUTPUT = {
  avatar: { width: AVATAR_SIDE_PX, height: AVATAR_SIDE_PX },
  cover: { width: COVER_WIDTH_PX, height: COVER_HEIGHT_PX },
  venue: { width: VENUE_WIDTH_PX, height: VENUE_HEIGHT_PX },
} as const satisfies Record<string, { width: number; height: number }>;

export type CropTarget = keyof typeof CROP_OUTPUT;

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

/**
 * The cache-busting suffix for a player's photo URLs.
 *
 * ONE PLACE, BECAUSE THE WRONG ANSWER LOOKED RIGHT IN FOUR (round 16, item 2).
 * Every caller passed `player.created_at` — the header avatar, the account
 * identity, the account cover — and each looked reasonable on its own. The
 * parameter it feeds is named `updatedAt` and its docstring promises the value
 * "moves whenever the row does"; `created_at` is the one timestamp that
 * cannot. A replaced photo therefore kept its URL and browsers kept the old
 * bytes, measurably: magenta then yellow left the screen magenta.
 *
 * `updated_at` IS OPTIONAL BECAUSE THE MIGRATION IS QUEUED. Until
 * `20260823100000_players_updated_at` is applied the column is absent and this
 * returns `created_at`, which is exactly today's behaviour — the surface
 * degrades to the old bug rather than to an error. The moment it is applied,
 * every photo URL in the product starts moving with its bytes, with no deploy.
 */
export function photoVersionFor(player: {
  created_at: string;
  updated_at?: string;
}): string {
  return player.updated_at ?? player.created_at;
}
