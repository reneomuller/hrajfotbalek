"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The one toast in the product, in two variants (§8).
 *
 * ONE COMPONENT so that several different moments cannot end up looking like
 * several different products. Two VARIANTS because a success and a failure are
 * not the same announcement, and giving them the same semantics gets one of
 * them wrong:
 *
 *   success   role="status"  aria-live="polite"      auto-dismiss after 5s
 *   error     role="alert"   aria-live="assertive"   NO auto-dismiss
 *
 * A polite region waits for a screen reader to finish its sentence; an
 * assertive one interrupts. Interrupting for "Signed in." is rude, and waiting
 * to mention that something failed is worse than rude — by the time the
 * sentence finishes, the reader has moved on believing it worked.
 *
 * THE ERROR VARIANT NEVER AUTO-DISMISSES, for the same reason. A success is a
 * confirmation of something the reader already knows they did, so it can leave
 * on its own. A failure is news, it may be the only place the failure is
 * stated, and a message that removes itself after five seconds is a message
 * that a reader who looked away has no way to recover.
 *
 * THE TIMER PAUSES ON HOVER AND ON FOCUS. Five seconds is enough to read a
 * short sentence and not enough to read one while doing something else, and a
 * toast that vanishes while the pointer is resting on its dismiss button is a
 * toast that has moved the target out from under a click.
 *
 * THE MESSAGE ARRIVES ALREADY RESOLVED. This takes a string, not a key: the
 * copy lives in `lib/strings.ts` and is looked up in the reader's own locale.
 * A client component doing its own lookup would need the whole string table
 * shipped to the browser.
 */

export type ToastVariant = "success" | "error";

export interface ToastProps {
  message: string;
  variant?: ToastVariant;
  /** Accessible name for the dismiss control — `common.dismiss`. */
  dismissLabel: string;
  onDismiss?: () => void;
  /** Success only; the error variant ignores it and never self-dismisses. */
  durationMs?: number;
}

export function Toast({
  message,
  variant = "success",
  dismissLabel,
  onDismiss,
  durationMs = 5000,
}: ToastProps) {
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    onDismiss?.();
  }, [onDismiss]);

  useEffect(() => {
    // An error stays until it is dismissed. So does a paused success.
    if (variant === "error" || paused) return;

    timer.current = setTimeout(dismiss, durationMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // `message` is in the deps so raising the SAME toast twice restarts the
    // countdown rather than inheriting the first one's remaining time.
  }, [variant, paused, durationMs, dismiss, message]);

  const isError = variant === "error";

  return (
    <div
      // The two semantics, chosen together rather than one at a time.
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      data-testid="toast"
      data-variant={variant}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`pointer-events-auto flex w-full max-w-[420px] items-start gap-3 rounded-card bg-surface-raised px-4 py-3 shadow-lift ${
        isError ? "border border-danger" : ""
      }`}
    >
      {/*
        THREE LINES, THEN CLIP. A toast is a sentence; anything that needs four
        lines is a screen. `line-clamp-3` bounds it without letting a long
        message push the dismiss control off the pill.
      */}
      <p
        className={`m-0 line-clamp-3 flex-1 text-body ${
          isError ? "text-bone" : "text-bone"
        }`}
      >
        {message}
      </p>

      {/*
        A 44px target, which for an icon this small means padding rather than
        a bigger glyph. `-m-2` pulls the enlarged hit area back out of the
        layout so the button looks the size it should and hits the size it
        must.
      */}
      <button
        type="button"
        onClick={dismiss}
        aria-label={dismissLabel}
        data-testid="toast-dismiss"
        className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-pill text-muted transition-colors hover:text-bone"
      >
        <span aria-hidden className="text-body leading-none">
          ✕
        </span>
      </button>
    </div>
  );
}
