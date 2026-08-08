"use client";

import { useCallback, useState } from "react";
import { Toast, type ToastVariant } from "@/components/ui/Toast";

/**
 * The single place a toast can appear, and the rule about how many.
 *
 * ONE AT A TIME. A stack of toasts is a stack of things covering the screen the
 * reader is trying to use, and on a 390px viewport two of them reach the middle
 * of the page. A second toast REPLACES the first.
 *
 * WITH ONE EXCEPTION, WHICH IS THE INTERESTING RULE: an error is never replaced
 * by another error. Two failures in a row are usually the same failure retried,
 * and letting the second overwrite the first turns a message the reader was
 * part-way through reading into a message that looks identical but has silently
 * restarted. A success may replace an error — the reader has moved on, and the
 * error is no longer true.
 *
 * POSITIONED ABOVE THE CLAIM BAR AND THE NAV PILL. `--tabbar-h` is the pill's
 * full footprint including its inset and the home indicator, so reading it here
 * means the toast rises with the pill rather than needing its own copy of the
 * arithmetic.
 *
 * `pointer-events-none` on the container and `pointer-events-auto` on the toast
 * itself: the strip spans the width of the viewport, and without this it would
 * swallow taps aimed at whatever is beside the toast rather than under it.
 */

export interface ToastState {
  message: string;
  variant: ToastVariant;
}

export function ToastHost({
  initial = null,
  dismissLabel,
}: {
  initial?: ToastState | null;
  dismissLabel: string;
}) {
  const [toast, setToast] = useState<ToastState | null>(initial);

  const dismiss = useCallback(() => setToast(null), []);

  return (
    <div
      data-testid="toast-host"
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-gutter"
      style={{ bottom: "calc(var(--tabbar-h) + 12px)" }}
    >
      {toast && (
        <Toast
          /*
           * KEYED ON THE MESSAGE AND VARIANT, so raising a different toast
           * remounts the body rather than resetting its state from an effect.
           * The obvious alternative — an effect that resets `paused` and the
           * timer whenever the message changes — sets state during an effect
           * and cascades a second render on every toast. Letting React discard
           * the old instance is simpler and is also what re-fires the timer
           * when the same toast is raised twice.
           */
          key={`${toast.variant}:${toast.message}`}
          message={toast.message}
          variant={toast.variant}
          dismissLabel={dismissLabel}
          onDismiss={dismiss}
        />
      )}
    </div>
  );
}

/**
 * The replacement rule, exported so it can be tested and so a caller cannot
 * accidentally implement a different one.
 *
 * Returns the toast that should be on screen given what is there now.
 */
export function nextToast(current: ToastState | null, incoming: ToastState): ToastState {
  if (current?.variant === "error" && incoming.variant === "error") {
    // Two failures in a row are usually one failure retried. Keep the message
    // the reader is already reading.
    return current;
  }
  return incoming;
}
