"use client";

import { PhotoUpload } from "@/components/account/PhotoUpload";
import { strings } from "@/lib/strings";

/**
 * Upload a photograph of the pitch, with a drag-crop (round 30, item 1).
 *
 * ~~NO CLIENT-SIDE CROP, unlike the avatar. A pitch is landscape and the panel
 * is landscape; cropping to a square here would throw away the goalposts.~~
 * REVERSED, and the reasoning was half right. Nothing here ever cropped to a
 * SQUARE — that was the avatar's problem, not this one — and the conclusion
 * drawn from it was that no crop was needed at all. What actually happened is
 * that `object-cover` took the middle of whatever was uploaded, and an
 * organizer photographing a pitch on a phone got a centre crop of a portrait
 * frame: sky and grass, no goal. The fix is the same layer the banner has,
 * framed to the venue's own 16:9 rather than to a square.
 *
 * IT IS NOW A THIN WRAPPER, and that is the point. `PhotoUpload` already owned
 * the size limit, the type allow-list, the claim-the-path-first ordering, the
 * cache-buster and the cropper; this file had its own copy of the first four
 * and none of the fifth. Two implementations of "upload an image" is how one
 * of them ends up without a crop for a year.
 *
 * Admin copy is English only — see `lib/i18n/locales.ts`.
 */
export function VenuePhotoUpload({
  venueId,
  hasPhoto,
}: {
  venueId: string;
  hasPhoto: boolean;
}) {
  return (
    <div data-testid="venue-photo-upload">
      <p className="m-0 text-[10px] uppercase tracking-eyebrow text-muted">
        {strings.admin.venuePhotoTitle}
      </p>

      <div className="mt-2">
        <PhotoUpload target="venue" venueId={venueId} hasPhoto={hasPhoto}>
          <span
            data-testid="venue-photo-control"
            className="inline-flex min-h-11 items-center rounded-control border border-hairline-strong px-3 text-small font-semibold text-volt"
          >
            {hasPhoto ? strings.admin.venuePhotoReplace : strings.admin.venuePhotoUpload}
          </span>
        </PhotoUpload>
      </div>

      <p className="mt-2 mb-0 text-[12px] leading-snug text-muted">
        {strings.admin.venuePhotoHint}
      </p>
    </div>
  );
}
