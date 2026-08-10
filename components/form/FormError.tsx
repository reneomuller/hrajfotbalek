"use client";

import type { ReactNode } from "react";

/**
 * §2.11's FORM-LEVEL ERROR BLOCK.
 *
 * The middle of §2.11's three surfaces, for a failure that is about the
 * SUBMISSION rather than about a field: a race lost, a window closed, a
 * permission refused. There is no input to point at, so an inline error has
 * nowhere to go, and a toast would be wrong because the form is still on
 * screen and still the thing to act on.
 *
 * IT SITS ABOVE THE SUBMIT BUTTON AND LEAVES THE FORM STANDING. That is the
 * correction it exists to make: the booking flow REPLACED the whole form with
 * an error card, so a player who lost a race lost their payment choice with it
 * and had to start again from the game page. Keeping the form means the way
 * forward is usually "try again", which is one tap.
 *
 * ONE SENTENCE PLUS A WAY FORWARD, per §2.11 — `children` is that way forward,
 * and it is optional because some failures have none beyond retrying.
 *
 * `role="alert"` so it is announced when it appears; the glyph is `aria-hidden`
 * because colour and an icon are never the signal — the sentence is.
 */
export function FormError({
  title,
  message,
  code,
  children,
}: {
  title?: string;
  message: string;
  /** Surfaced as a data attribute so a spec and a bug report can quote it. */
  code?: string;
  children?: ReactNode;
}) {
  return (
    <div
      role="alert"
      data-testid="form-error"
      data-error-code={code}
      className="flex gap-3 rounded-card bg-surface-raised p-4"
    >
      <span aria-hidden className="mt-[2px] shrink-0 text-body-lg leading-none text-danger">
        !
      </span>
      <div className="min-w-0">
        {title && <p className="m-0 text-body-lg font-semibold text-bone">{title}</p>}
        <p className={`m-0 text-body leading-relaxed text-muted ${title ? "mt-1" : ""}`}>
          {message}
        </p>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </div>
  );
}
