"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import {
  AVATAR_SIDE_PX,
  COVER_HEIGHT_PX,
  COVER_WIDTH_PX,
  PROFILE_PHOTOS_BUCKET,
  extensionForMimeType,
  rejectPhoto,
} from "@/lib/storage/avatar";
import { useStrings } from "@/components/LocaleProvider";

/**
 * Crops to a centred square and re-encodes, in the browser.
 *
 * WHY CROP AT ALL. Avatars render in circles at 40px. A 4000×3000 phone photo
 * uploaded whole costs the player a slow mobile upload to deliver pixels that
 * are thrown away at render, and it is the difference between fitting under the
 * 2 MiB bucket limit and being refused by it.
 *
 * WEBP, ALWAYS. Re-encoding normalises the type as well as the size, so the
 * extension in the object key is known before the file is read — and the key is
 * what the storage policy matches on. It also strips EXIF, which is not the
 * goal but is a real benefit: phone photos carry GPS coordinates, and this one
 * is about to be public.
 */
async function cropToRatio(file: File, outW: number, outH: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  /*
   * CENTRE CROP TO THE OUTPUT'S RATIO, then scale. A square avatar takes the
   * largest centred square; a 3:1 cover takes the largest centred 3:1 band.
   * Same arithmetic, and generalising it is what let the cover reuse this
   * whole function rather than growing a second one beside it (round 8,
   * item 10).
   */
  const target = outW / outH;
  const source = bitmap.width / bitmap.height;
  const cropW = source > target ? bitmap.height * target : bitmap.width;
  const cropH = source > target ? bitmap.height : bitmap.width / target;

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");

  context.drawImage(
    bitmap,
    (bitmap.width - cropW) / 2,
    (bitmap.height - cropH) / 2,
    cropW,
    cropH,
    0,
    0,
    outW,
    outH,
  );
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.9),
  );
  if (!blob) throw new Error("encode failed");
  return blob;
}

/**
 * The avatar IS the control.
 *
 * This used to be a bordered button labelled "Upload a photo" sitting under a
 * heading, and a reviewer looking for "where do I change my picture" did not
 * find it. Wrapping the avatar in the file label and putting a small volt
 * pencil on its corner is the shape every product this competes with uses, and
 * it needs no heading to explain itself.
 *
 * `children` is the avatar the page already renders — photo or initials — so
 * the fallback logic stays in one place rather than being duplicated here.
 */
export function PhotoUpload({
  hasPhoto,
  children,
  target = "avatar",
  className,
}: {
  hasPhoto: boolean;
  children?: React.ReactNode;
  /**
   * Which picture this control changes (round 8, item 10).
   *
   * ONE COMPONENT, TWO TARGETS, because item 10's requirement is parity: the
   * cover is changed "exactly as they change their profile picture". Two
   * components would be two places for the size limit, the type allow-list,
   * the claim-the-path-first ordering and the error copy to drift.
   */
  target?: "avatar" | "cover";
  /** Wrapper classes — the cover's control overlays a band, not a circle. */
  className?: string;
}) {
  const t = useStrings();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);

    // The bucket enforces both of these as well. This is the part that says so
    // before a slow upload rather than after it.
    const rejection = rejectPhoto(file);
    if (rejection) {
      setError(rejection.reason === "type" ? t.account.photoBadType : t.account.photoTooBig);
      event.target.value = "";
      return;
    }

    setBusy(true);
    try {
      const cropped =
        target === "cover"
          ? await cropToRatio(file, COVER_WIDTH_PX, COVER_HEIGHT_PX)
          : await cropToRatio(file, AVATAR_SIDE_PX, AVATAR_SIDE_PX);
      const supabase = createBrowserSupabaseClient();

      /*
       * The path is claimed from the database FIRST.
       *
       * `set_profile_photo` derives `players/<own id>.<ext>` and returns it —
       * the client never chooses a key. Uploading first and recording second
       * would mean a failed RPC leaves an orphan object in a public bucket with
       * no row pointing at it and nothing to clean it up.
       */
      const extension = extensionForMimeType("image/webp");
      const { data: path, error: rpcError } = await supabase.rpc(
        target === "cover" ? "set_cover_photo" : "set_profile_photo",
        { p_extension: extension! },
      );
      if (rpcError || !path) throw new Error(rpcError?.message ?? "no path");

      const { error: uploadError } = await supabase.storage
        .from(PROFILE_PHOTOS_BUCKET)
        .upload(path, cropped, { contentType: "image/webp", upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      router.refresh();
    } catch (cause) {
      console.error("photo upload failed", cause);
      setError(t.account.photoUploadFailed);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      onChange={onFile}
      disabled={busy}
      data-testid="photo-input"
      className="sr-only"
    />
  );

  // Avatar-as-control. The badge is `aria-hidden` because the label already
  // names the action for a screen reader; announcing a pencil twice is noise.
  if (children) {
    return (
      <label
        data-testid="photo-avatar-control"
        aria-label={hasPhoto ? t.account.photoReplace : t.account.photoUpload}
        className={`relative inline-block cursor-pointer ${className ?? ""}`}
      >
        {input}
        <span className={busy ? "opacity-50 transition-opacity" : "transition-opacity"}>
          {children}
        </span>
        {/* The pencil badge belongs to the AVATAR shape. The cover's control
            carries its own label, so a second affordance on it would be two
            things saying one thing. */}
        {target === "avatar" && (
          <span
            aria-hidden
            className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-volt text-[13px] leading-none text-surface"
          >
            ✎
          </span>
        )}
        {error ? (
          <span role="alert" data-testid="photo-error" className="sr-only">
            {error}
          </span>
        ) : null}
      </label>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="inline-flex cursor-pointer items-center justify-center rounded-control border border-hairline-volt px-4 py-2 text-[13px] font-bold uppercase tracking-wide text-volt transition hover:bg-volt/10">
        {input}
        {busy ? t.account.photoUploading : hasPhoto ? t.account.photoReplace : t.account.photoUpload}
      </label>

      {error ? (
        <span role="alert" data-testid="photo-error" className="text-sm text-red-400">
          {error}
        </span>
      ) : null}
    </div>
  );
}
