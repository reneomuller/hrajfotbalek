"use client";

import { useState, type ReactNode } from "react";
import { TermsCheckbox } from "@/components/form/TermsCheckbox";

/**
 * OUR TERMS BOX, ONLY WHEN STRIPE CANNOT DRAW ITS OWN (round 38).
 *
 * The normal case has no use for this: the session asks Stripe to require its
 * terms box directly above Pay (`lib/payments/termsConsent.ts`). It renders
 * only when Stripe refused that for want of a Terms of Service URL in the
 * Dashboard, so checkout keeps working and the terms are still accepted.
 *
 * ABOVE THE FORM, AND THE FORM WAITS FOR IT. A box BELOW an iframe cannot
 * stop the Pay button inside it — the payment would complete whatever the box
 * said — so the only placement that actually gates the purchase is in front of
 * it: tick, and the payment form appears.
 */
export function CheckoutTermsGate({ children }: { children: ReactNode }) {
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="flex flex-col gap-4" data-testid="checkout-terms-gate">
      <TermsCheckbox checked={accepted} onChange={setAccepted} />
      {accepted && children}
    </div>
  );
}
