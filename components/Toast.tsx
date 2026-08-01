"use client";

import { useEffect, useState } from "react";

/**
 * The one toast in the product (§8, REQ-UX-001).
 *
 * Volt-on-black, bottom of the viewport, auto-dismissing. One component so
 * five different moments cannot end up looking like five different products —
 * booking created, signed in, cancellation credited, top-up confirmed, link
 * copied.
 *
 * THE MESSAGE ARRIVES ALREADY RESOLVED. This component takes a string, not a
 * key: the copy lives in `lib/strings.ts` and is looked up server-side in the
 * reader's own locale. A client component doing its own lookup would need the
 * whole string table shipped to the browser.
 *
 * `role="status"` with `aria-live="polite"` rather than `alert`: none of these
 * is an error, and a polite region waits for a screen reader to finish its
 * sentence instead of interrupting it. It is also the reason the element is
 * rendered and then filled rather than mounted on demand — a live region that
 * appears at the same moment as its text is frequently missed entirely.
 *
 * AUTO-DISMISS, AND ALSO DISMISSIBLE. The timer is the ordinary path; the
 * close button is for the reader who is trying to tap something underneath it.
 */
export function Toast({
  message,
  durationMs = 4000,
  closeLabel,
}: {
  message: string | null;
  durationMs?: number;
  closeLabel: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-gutter"
    >
      {/*
        KEYED ON THE MESSAGE, so a new one REMOUNTS the body rather than
        resetting its state from an effect. That is not a style preference: the
        obvious version — an effect that sets `visible` back to true whenever
        `message` changes — sets state synchronously during an effect, which
        cascades a second render on every toast and is what the lint rule is
        guarding against. Letting React discard the old instance is both
        simpler and the thing that actually re-fires the timer when the same
        toast is raised twice.
      */}
      {message !== null && (
        <ToastBody
          key={message}
          message={message}
          durationMs={durationMs}
          closeLabel={closeLabel}
        />
      )}
    </div>
  );
}

function ToastBody({
  message,
  durationMs,
  closeLabel,
}: {
  message: string;
  durationMs: number;
  closeLabel: string;
}) {
  const [dismissed, setDismissed] = useState(false);

  // The only state written here is written from a timer callback, not during
  // the effect itself.
  useEffect(() => {
    const timer = setTimeout(() => setDismissed(true), durationMs);
    return () => clearTimeout(timer);
  }, [durationMs]);

  if (dismissed) return null;

  return (
    <div
      data-testid="toast"
      className="pointer-events-auto flex max-w-[420px] items-center gap-3 rounded-card border border-hairline-volt bg-surface-overlay px-4 py-3 shadow-volt-glow"
    >
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-volt" />
      <span className="text-[13px] leading-snug text-bone">{message}</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label={closeLabel}
        data-testid="toast-close"
        className="ml-1 shrink-0 rounded-chip px-2 py-1 font-mono text-[11px] text-muted transition hover:text-bone"
      >
        ✕
      </button>
    </div>
  );
}
