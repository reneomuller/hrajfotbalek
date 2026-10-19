"use client";

import { useState, type ReactNode } from "react";

/**
 * OUR WAIVER BOX, ONLY WHEN STRIPE CANNOT DRAW ITS OWN (rounds 38 and 40).
 *
 * The normal case has no use for this: the session asks Stripe to require its
 * box directly above Pay, worded as the lawyer's waiver (Texty 3.3). It renders
 * only when Stripe refused that for want of a Terms of Service URL in the
 * Dashboard, so checkout keeps working and the waiver is still given.
 *
 * VISIBLE, BUT LOCKED (round 40, the owner). ~~Tick, and the payment form
 * appears.~~ The form is on screen from the start so the player can see what
 * they are about to pay; until the box is ticked it is `inert` — no click, no
 * focus, no keyboard path into the iframe — and dimmed so it reads as waiting.
 * A box BELOW an iframe could not stop the Pay button inside it; a wrapper
 * that removes the iframe from interaction can.
 */
export function CheckoutTermsGate({
  label,
  lockedHint,
  children,
}: {
  label: string;
  lockedHint: string;
  children: ReactNode;
}) {
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="flex flex-col gap-4" data-testid="checkout-terms-gate">
      <label className="flex min-h-11 items-start gap-3 text-sm text-bone">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          data-testid="checkout-waiver"
          className="mt-1 accent-volt"
        />
        <span>{label}</span>
      </label>
      {!accepted && (
        <p data-testid="checkout-locked-hint" className="m-0 text-[12px] text-muted">
          {lockedHint}
        </p>
      )}
      <div
        inert={!accepted}
        data-testid="checkout-form-wrapper"
        data-locked={accepted ? "false" : "true"}
        className={accepted ? "" : "pointer-events-none select-none opacity-40"}
      >
        {children}
      </div>
    </div>
  );
}
