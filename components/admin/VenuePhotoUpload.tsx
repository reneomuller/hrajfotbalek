"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { VENUE_PHOTOS_BUCKET } from "@/lib/storage/avatar";
import { strings } from "@/lib/strings";

/** 4 MiB, matching `storage.buckets.file_size_limit` on the bucket itself. */
const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPTED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Upload a photograph of the pitch, from the game form (§5.4).
 *
 * WHY THIS EXISTS. Until now a venue photo had to be a file committed under
 * `public/venues/`, which made adding one a deploy. §5.4 always intended
 * human-supplied pitch photographs; it did not intend the human to be a
 * developer. An organizer standing at a new pitch can now photograph it and
 * have it on the game page before they leave.
 *
 * THE PATH IS CLAIMED FROM THE DATABASE FIRST, exactly as the profile-photo
 * flow does. `set_venue_photo` derives `venues/<venue id>.<ext>` and returns
 * it — the client never chooses a key, so no call can point at another venue's
 * object. Uploading first and recording second would leave an orphan in a
 * public bucket with no row pointing at it and nothing to clean it up.
 *
 * NO CLIENT-SIDE CROP, unlike the avatar. A pitch is landscape and the panel
 * is landscape; cropping to a square here would throw away the goalposts.
 * Bucket-side limits are the enforcement either way.
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
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);

    // The bucket enforces both of these as well. This is the part that says so
    // before a slow upload on a phone at a pitch, rather than after it.
    const extension = ACCEPTED[file.type];
    if (!extension) {
      setError(strings.admin.venuePhotoBadType);
      event.target.value = "";
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(strings.admin.venuePhotoTooBig);
      event.target.value = "";
      return;
    }

    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();

      const { data: path, error: rpcError } = await supabase.rpc("set_venue_photo", {
        p_venue_id: venueId,
        p_extension: extension,
      });
      if (rpcError || !path) throw new Error(rpcError?.message ?? "no path");

      const { error: uploadError } = await supabase.storage
        .from(VENUE_PHOTOS_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      router.refresh();
    } catch (cause) {
      console.error("venue photo upload failed", cause);
      setError(strings.admin.venuePhotoFailed);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="inline-flex w-fit cursor-pointer items-center justify-center rounded-control border border-hairline-volt px-4 py-2 text-[13px] font-bold uppercase tracking-wide text-volt transition hover:bg-volt/10">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onFile}
          disabled={busy}
          data-testid="venue-photo-input"
          className="sr-only"
        />
        {busy
          ? strings.common.loading
          : hasPhoto
            ? strings.admin.venuePhotoReplace
            : strings.admin.venuePhotoUpload}
      </label>

      <p className="text-[12px] leading-snug text-muted">
        {strings.admin.venuePhotoHint}
      </p>

      {error && (
        <p role="alert" data-testid="venue-photo-error" className="text-[12px] text-volt">
          {error}
        </p>
      )}
    </div>
  );
}
