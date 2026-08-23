"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStrings } from "@/components/LocaleProvider";

/**
 * Choose which part of a photograph becomes the banner (round 16, item 15).
 *
 * WHAT IT REPLACES. `cropToRatio` took the largest CENTRED rectangle of the
 * output's aspect and scaled it. For a landscape photo that is usually right
 * and always defensible; for a PORTRAIT one cropped to 3:1 it is a thin strip
 * across the middle — the subject's waist, a patch of sky, whatever happened
 * to be halfway down. The player had no way to know that before uploading and
 * no way to fix it afterwards except by uploading a different photograph.
 *
 * THE FRAME IS THE OUTPUT'S ASPECT, exactly. What is inside it when they press
 * Save is what gets stored, which is the only property that makes a cropper
 * worth having — a preview that is merely indicative is a second thing to
 * distrust.
 *
 * COVER, NOT CONTAIN, AND CLAMPED. The image is scaled so the frame is always
 * full and the drag is bounded so it stays full: there is no position from
 * which a letterboxed edge can be saved. A cropper that lets you frame empty
 * space produces banners with a black stripe down one side and no obvious
 * culprit.
 *
 * POINTER EVENTS, NOT MOUSE + TOUCH. One set of handlers covers finger, mouse
 * and stylus, and `setPointerCapture` means a drag that leaves the frame keeps
 * tracking rather than sticking mid-gesture — which on a phone is most drags,
 * because the frame is 100px tall and a thumb is not precise.
 *
 * PORTALLED. CLAUDE.md's modal law: `z-50` is a rank within a stacking
 * context, and this opens from inside `main` on the account page, which is
 * `relative z-10` — capped below the nav pill at `z-40`. Rendered into
 * `document.body` so its z-index competes on equal terms.
 */

/** Zoom bounds. 1 is "just covers the frame"; 4 is enough to crop a face out
 *  of a group photo without letting anyone reach a single blurred pixel. */
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.01;

export interface CropRect {
  /** Source rectangle in the ORIGINAL image's pixels, ready for `drawImage`. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export function PhotoCropper({
  file,
  outputWidth,
  outputHeight,
  onCancel,
  onConfirm,
}: {
  file: File;
  outputWidth: number;
  outputHeight: number;
  onCancel: () => void;
  onConfirm: (crop: CropRect) => void;
}) {
  const t = useStrings();
  const frameRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  /*
   * AN OBJECT URL, REVOKED ON THE WAY OUT. A data URL would base64 a phone
   * photo into memory twice over; this hands the decoder the blob it already
   * has. Leaking it would pin the whole file for the life of the tab.
   */
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  // The frame's width is the dialog's; its height follows the output aspect,
  // measured rather than assumed so a translation widening the dialog cannot
  // silently change what is being cropped.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const w = el.clientWidth;
    setFrame({ w, h: Math.round((w * outputHeight) / outputWidth) });
  }, [outputWidth, outputHeight, url]);

  /** Scale at which the image exactly covers the frame. */
  const baseScale =
    natural && frame ? Math.max(frame.w / natural.w, frame.h / natural.h) : 1;
  const scale = baseScale * zoom;
  const displayed = natural
    ? { w: natural.w * scale, h: natural.h * scale }
    : { w: 0, h: 0 };

  /** Keep the frame covered: the image's edges may never come inside it. */
  const clamp = useCallback(
    (x: number, y: number) => {
      if (!frame) return { x, y };
      return {
        x: Math.min(0, Math.max(frame.w - displayed.w, x)),
        y: Math.min(0, Math.max(frame.h - displayed.h, y)),
      };
    },
    [frame, displayed.w, displayed.h],
  );

  // Centre whenever the geometry changes — a new image, or a zoom that made
  // the current offset illegal.
  useEffect(() => {
    if (!frame || !natural) return;
    setOffset((current) => {
      const centred =
        current.x === 0 && current.y === 0
          ? { x: (frame.w - natural.w * baseScale * zoom) / 2, y: (frame.h - natural.h * baseScale * zoom) / 2 }
          : current;
      return {
        x: Math.min(0, Math.max(frame.w - natural.w * baseScale * zoom, centred.x)),
        y: Math.min(0, Math.max(frame.h - natural.h * baseScale * zoom, centred.y)),
      };
    });
  }, [frame, natural, baseScale, zoom]);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start) return;
    setOffset(
      clamp(start.ox + (event.clientX - start.x), start.oy + (event.clientY - start.y)),
    );
  }

  function onPointerUp() {
    drag.current = null;
  }

  function confirm() {
    if (!natural || !frame) return;
    /*
     * THE SOURCE RECTANGLE, in the ORIGINAL image's pixels. Everything above
     * is in frame pixels; dividing by the scale converts back, and `drawImage`
     * does the resampling from full-resolution source rather than from the
     * downscaled thing on screen. Cropping the preview would throw away detail
     * the file already has.
     */
    onConfirm({
      sx: -offset.x / scale,
      sy: -offset.y / scale,
      sw: frame.w / scale,
      sh: frame.h / scale,
    });
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <button
        type="button"
        aria-label={t.common.close}
        onClick={onCancel}
        className="fixed inset-0 z-[70] cursor-default bg-ink/80"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.account.cropTitle}
        data-testid="photo-cropper"
        className="lifted fixed left-1/2 top-1/2 z-[71] w-[min(420px,calc(100vw-2*22px))] -translate-x-1/2 -translate-y-1/2 rounded-card p-5 shadow-lift"
      >
        <h2 className="m-0 text-[17px] font-bold uppercase tracking-wide text-white">
          {t.account.cropTitle}
        </h2>
        <p className="mt-1 mb-4 text-[13px] leading-snug text-muted">
          {t.account.cropHint}
        </p>

        <div
          ref={frameRef}
          data-testid="photo-cropper-frame"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={frame ? { height: `${frame.h}px` } : undefined}
          className="relative w-full cursor-grab touch-none overflow-hidden rounded-card bg-ink active:cursor-grabbing"
        >
          {url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={url}
              alt=""
              draggable={false}
              onLoad={(event) =>
                setNatural({
                  w: event.currentTarget.naturalWidth,
                  h: event.currentTarget.naturalHeight,
                })
              }
              /*
                A TRANSFORM, NOT `width`/`height`. The position changes on every
                pointer move; laying out with dimensions would reflow the
                dialog sixty times a second, and a transform is composited.
                This is the "transient animation value" exception the
                no-inline-styles rule names.
              */
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px)`,
                width: `${displayed.w}px`,
                height: `${displayed.h}px`,
              }}
              className="max-w-none origin-top-left select-none"
            />
          )}
        </div>

        <label className="mt-4 block">
          <span className="field-label block">{t.account.cropZoom}</span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={ZOOM_STEP}
            value={zoom}
            data-testid="photo-cropper-zoom"
            onChange={(event) => setZoom(Number(event.target.value))}
            className="mt-2 w-full accent-volt"
          />
        </label>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={confirm}
            disabled={!natural || !frame}
            data-testid="photo-cropper-save"
            className="rounded-control bg-volt px-5 py-2 text-[13px] font-bold text-ink disabled:opacity-60"
          >
            {t.account.cropSave}
          </button>
          <button
            type="button"
            onClick={onCancel}
            data-testid="photo-cropper-cancel"
            className="rounded-control border border-hairline-strong px-4 py-2 text-[13px] text-bone"
          >
            {t.common.close}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
