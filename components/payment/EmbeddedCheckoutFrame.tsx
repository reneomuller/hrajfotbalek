"use client";

import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useMemo } from "react";

/**
 * Stripe's embedded payment form, inside our own page (round 25, item 2).
 *
 * WHAT STRIPE'S BRANDING ALLOWS, STATED PLAINLY BECAUSE THE ITEM ASKS AND
 * BECAUSE THE ANSWER IS A CONSTRAINT SOMEBODY WILL OTHERWISE TRY TO FIGHT:
 *
 *   WE CONTROL EVERYTHING OUTSIDE THE FRAME. The page shell, the heading, the
 *   surrounding panel, the volt border — all ours, all in the v2 language, and
 *   the player never leaves the origin.
 *
 *   WE DO NOT CONTROL THE INSIDE. The form is a Stripe iframe. Its colours
 *   come from the BRANDING SETTINGS in the Stripe dashboard
 *   (Settings → Branding), not from our stylesheet: no CSS of ours crosses the
 *   frame boundary, and no `appearance` object is accepted for Checkout the
 *   way it is for Payment Element. So the accent colour, the font from
 *   Stripe's list, the logo and the icon are set ONCE by the owner, in the
 *   dashboard, and apply to every session.
 *
 *   IT DEFAULTS TO A LIGHT FORM. Stripe's Checkout branding has no dark theme
 *   toggle; the fields are on white unless the dashboard's background colour
 *   is changed, and even then the contrast rules inside are Stripe's. **A
 *   volt-on-black frame around a light form is the honest expectation**, and
 *   trying to force otherwise ends in an unreadable card field.
 *
 * THE STRIPE OBJECT IS MEMOISED ON THE PUBLISHABLE KEY. `loadStripe` returns a
 * promise and re-calling it on every render remounts the whole frame, which in
 * a payment form means the buyer's half-typed card number disappears.
 */
export function EmbeddedCheckoutFrame({
  clientSecret,
  publishableKey,
}: {
  clientSecret: string;
  publishableKey: string;
}) {
  const stripe = useMemo<Promise<Stripe | null>>(
    () => loadStripe(publishableKey),
    [publishableKey],
  );

  return (
    <div
      data-testid="embedded-checkout"
      /*
        THE FRAME IS OURS AND IT SAYS SO. `rounded-card` with a volt hairline
        and the page's own surface behind it, so the form reads as a panel of
        this product rather than as a foreign object dropped into it — which is
        the whole reason for embedding rather than redirecting.

        `overflow-hidden` so the iframe's own square corners are clipped to the
        card radius: without it Stripe's white form pokes out of all four
        corners of a rounded panel, which is the single most obvious tell that
        something was pasted in.
      */
      className="overflow-hidden rounded-card border border-hairline-volt bg-surface p-1"
    >
      <EmbeddedCheckoutProvider stripe={stripe} options={{ clientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
