"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import {
  avatarUrl,
  AVATAR_SIDE_PX,
  COVER_HEIGHT_PX,
  COVER_WIDTH_PX,
  PROFILE_PHOTOS_BUCKET,
  extensionForMimeType,
  rejectPhoto,
} from "@/lib/storage/avatar";
import { PhotoCropper, type CropRect } from "@/components/account/PhotoCropper";
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
async function cropToRatio(
  file: File,
  outW: number,
  outH: number,
  /**
   * The part of the image to keep, in the ORIGINAL's pixels (round 16, item
   * 15). Omitted means the centred rectangle of the output's aspect, which is
   * what this function always did.
   */
  rect?: { sx: number; sy: number; sw: number; sh: number },
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  /*
   * ~~CENTRE CROP TO THE OUTPUT'S RATIO, then scale.~~ STILL THE FALLBACK, and
   * still right when nobody has said otherwise — but it is no longer the only
   * option, because for a PORTRAIT photograph cropped to 3:1 the centred band
   * is a strip across the middle of whatever happened to be halfway down.
   *
   * `rect` is what the cropper returns. When it is absent the arithmetic below
   * is unchanged, which is why every caller that does not crop interactively
   * behaves exactly as before.
   */
  const target = outW / outH;
  const source = bitmap.width / bitmap.height;
  const centred = {
    sw: source > target ? bitmap.height * target : bitmap.width,
    sh: source > target ? bitmap.height : bitmap.width / target,
  };
  const area = rect ?? {
    sx: (bitmap.width - centred.sw) / 2,
    sy: (bitmap.height - centred.sh) / 2,
    sw: centred.sw,
    sh: centred.sh,
  };

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");

  context.drawImage(bitmap, area.sx, area.sy, area.sw, area.sh, 0, 0, outW, outH);
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
  photoVersion = null,
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
  /**
   * The version suffix the PAGE is currently rendering on this photo's URL.
   *
   * Needed to bust it — see `onFile`. It has to be the page's value rather
   * than one computed here, because busting a URL nobody rendered achieves
   * nothing: the browser's cache is keyed on the exact string in `src`.
   */
  photoVersion?: string | null;
  /** Wrapper classes — the cover's control overlays a band, not a circle. */
  className?: string;
}) {
  const t = useStrings();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The chosen file, waiting to be framed. Null when no crop is in progress. */
  const [pending, setPending] = useState<File | null>(null);

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

    /*
     * THE CROPPER OPENS FIRST, AND NOTHING IS UPLOADED UNTIL IT CLOSES
     * (round 16, item 15). The upload rules are unchanged and still run BEFORE
     * it: refusing a 9 MB HEIC after somebody has spent thirty seconds framing
     * it would be worse than refusing it immediately.
     */
    setPending(file);
    event.target.value = "";
  }

  async function upload(file: File, rect?: CropRect) {
    setPending(null);
    setBusy(true);
    try {
      const cropped =
        target === "cover"
          ? await cropToRatio(file, COVER_WIDTH_PX, COVER_HEIGHT_PX, rect)
          : await cropToRatio(file, AVATAR_SIDE_PX, AVATAR_SIDE_PX, rect);
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

      /*
       * THE UPLOAD WORKED AND THE SCREEN DID NOT CHANGE (round 16, item 2).
       *
       * The object key is derived from the player id and never varies, so a
       * REPLACEMENT writes new bytes to a URL this browser already has. The
       * page's cache-buster was supposed to prevent that — `avatarUrl` takes a
       * parameter literally named `updatedAt` and its docstring says it "moves
       * whenever the row does". Every caller passes `players.created_at`,
       * because `players` has no `updated_at` column to pass. So the suffix is
       * a constant per player, and the URL after a replacement is byte-identical
       * to the URL before it.
       *
       * Measured rather than reasoned: uploading magenta then yellow left the
       * screen magenta, before AND after a full reload.
       *
       * `cache: "reload"` FIXES IT FOR THE UPLOADER WITH NO SCHEMA. It forces
       * a network fetch and REPLACES this browser's cache entry for that exact
       * URL, so the `router.refresh()` on the next line re-renders an `<img>`
       * whose unchanged `src` now resolves to the new bytes. The URL has to be
       * rebuilt with the page's own `photoVersion`, since the cache is keyed on
       * the string that was rendered.
       *
       * IT IS HALF THE FIX. Everyone ELSE still holds the old bytes, and only
       * a moving version in the URL cures that — `players.updated_at`, which is
       * migration `20260823100000` and lands when the owner applies it. Until
       * then this is the half that addresses what was actually reported, and it
       * stays afterwards: it costs one request and removes the round trip
       * between uploading and seeing.
       */
      const rendered = avatarUrl(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        path as string,
        photoVersion,
      );
      if (rendered) {
        // Best-effort: a failed revalidation must not read as a failed upload,
        // because the upload has already succeeded by this line.
        await fetch(rendered, { cache: "reload", mode: "cors" }).catch(() => undefined);
      }

      router.refresh();
    } catch (cause) {
      console.error("photo upload failed", cause);
      setError(t.account.photoUploadFailed);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  /*
   * THE SAME CROPPER FOR BOTH TARGETS, at the aspect each one stores. The
   * avatar's frame is square and the cover's is 3:1; the component takes the
   * output size and derives the rest, so there is one implementation of the
   * drag, the clamp and the source-rect arithmetic rather than two that must
   * agree. The owner asked for the avatar "if it shares the component and it
   * is cheap" — it does, and it was.
   */
  const cropper = pending ? (
    <PhotoCropper
      file={pending}
      outputWidth={target === "cover" ? COVER_WIDTH_PX : AVATAR_SIDE_PX}
      outputHeight={target === "cover" ? COVER_HEIGHT_PX : AVATAR_SIDE_PX}
      onCancel={() => setPending(null)}
      onConfirm={(rect) => void upload(pending, rect)}
    />
  ) : null;

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      onChange={onFile}
      disabled={busy}
      data-testid={target === "cover" ? "photo-input-cover" : "photo-input"}
      className="sr-only"
    />
  );

  // Avatar-as-control. The badge is `aria-hidden` because the label already
  // names the action for a screen reader; announcing a pencil twice is noise.
  if (children) {
    return (
      <label
        /*
          THE TARGET NAMES WHICH PICTURE (round 9, item 1). Both the avatar and
          the cover render this component, and both shipped as
          `photo-avatar-control` — so the cover's control was indistinguishable
          from the avatar's in the DOM, and the first thing that tried to drive
          it uploaded to the wrong one. Two controls that do different things
          must not answer to the same name.
        */
        data-testid={target === "cover" ? "photo-cover-control" : "photo-avatar-control"}
        aria-label={hasPhoto ? t.account.photoReplace : t.account.photoUpload}
        /*
          NO `relative` IN THE BASE CLASS (round 14, item 3), and this is the
          bug Oliver kept hitting.
          
          It used to read `relative inline-block cursor-pointer ${className}`,
          and the COVER passes `absolute right-gutter top-2`. Two position
          utilities in one class string do not resolve by their order in the
          attribute — they resolve by their order in the STYLESHEET, and
          Tailwind emits `.absolute` before `.relative`. So `relative` won, the
          `right`/`top` offsets applied to an in-FLOW element instead of a
          positioned one, and the control landed at x = -22: off the left edge
          of the screen, underneath the profile tab row.
          
          It was measurable the whole time and looked fine in a screenshot,
          because the thing was simply not where anyone was looking. Same
          family as the `z-50` lesson in CLAUDE.md: a utility that is correct
          in isolation and defeated by its neighbour.
          
          `relative` now belongs to the AVATAR case only, which is the case
          that needs it — its pencil badge is absolutely positioned against
          this label. The cover brings its own position.
        */
        className={`${target === "avatar" ? "relative " : ""}inline-block cursor-pointer ${
          className ?? ""
        }`}
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
        {cropper}
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
      {cropper}
    </div>
  );
}
