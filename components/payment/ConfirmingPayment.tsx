"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useStrings } from "@/components/LocaleProvider";
import type { PendingPurchase } from "@/lib/payments/pendingPurchase";

/**
 * The wait between coming back from Stripe and the webhook landing
 * (round 15, item 1).
 *
 * IT NEVER SAYS THE PAYMENT WORKED. Stripe's redirect arrives in the player's
 * browser; the confirmation arrives on our server; the two are different
 * journeys and they race. The browser's leg carries no proof — a player who
 * abandons checkout and then types the return URL lands here exactly like one
 * who paid. So every state on this screen describes what WE know, and the
 * only thing that turns it into a confirmation is the row changing.
 *
 * IT ALSO NEVER SAYS IT FAILED. The slow state is the honest middle: Stripe
 * has the money, we have not been told yet, and the sentence that matters is
 * "you do not need to pay again".
 *
 * NO SERVER-STATE LIBRARY, AND THAT IS NOT AN OVERSIGHT. There is none in this
 * project, and this is the wrong reason to add one: nothing caches, nothing
 * invalidates, nothing else in the tree reads this value, and the poll is a
 * terminal loop that ends in a navigation away from the component. What it
 * needs is an effect that stops cleanly, which is the part written carefully
 * below.
 */

/** Every two seconds. Fast enough to feel immediate, slow enough that a
 *  minute of waiting is thirty requests rather than three hundred. */
const POLL_INTERVAL_MS = 2_000;

/** After this, stop implying it is about to happen and say what is true. */
const SLOW_AFTER_MS = 60_000;

interface StatusResponse {
  state?: string;
  href?: string | null;
}

export function ConfirmingPayment({
  purchase,
  fallbackHref,
}: {
  purchase: PendingPurchase;
  /**
   * Where the slow state points. Resolved on the server, because working it
   * out here would mean a second round trip to learn a booking's game id at
   * the moment we have decided to stop waiting.
   */
  fallbackHref: string;
}) {
  const t = useStrings();
  const router = useRouter();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    /*
     * ONE TIMER CHAIN, NOT `setInterval`. An interval fires on schedule
     * whether or not the previous request came back, so a slow response
     * stacks them; chaining the next timeout off the previous answer keeps
     * exactly one request in flight.
     */
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const startedAt = Date.now();

    async function poll() {
      if (cancelled) return;

      let body: StatusResponse | null = null;
      try {
        const res = await fetch(
          `/api/payment/status?kind=${purchase.kind}&id=${purchase.id}`,
          { cache: "no-store" },
        );
        /*
         * A FAILED POLL IS NOT A FAILED PAYMENT. A dropped connection, a
         * cold lambda, a 500 — none of them says anything about the money,
         * so the loop keeps going and the slow state is what eventually
         * speaks. The one exception is 401: the session went, and retrying
         * cannot fix that.
         */
        if (res.status === 401) {
          router.replace(fallbackHref);
          return;
        }
        if (res.ok) body = (await res.json()) as StatusResponse;
      } catch {
        body = null;
      }

      if (cancelled) return;

      if (body?.state === "confirmed" && body.href) {
        // `replace`, not `push`: the back button must not return the player
        // to a spinner for a payment that has already settled.
        router.replace(body.href);
        return;
      }

      if (body?.state === "elsewhere" && body.href) {
        router.replace(body.href);
        return;
      }

      if (Date.now() - startedAt >= SLOW_AFTER_MS) setSlow(true);

      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [purchase.kind, purchase.id, fallbackHref, router]);

  const slowBody =
    purchase.kind === "booking" ? t.payment.slowBookingBody : t.payment.slowPassBody;
  const slowLink =
    purchase.kind === "booking" ? t.payment.slowBackToGame : t.payment.slowBackToGames;

  return (
    <section
      data-testid="payment-confirming"
      data-state={slow ? "slow" : "waiting"}
      className="rounded-card border-2 border-hairline-volt bg-surface p-6"
    >
      {/*
        THE SPINNER IS `aria-hidden` AND THE STATUS IS A LIVE REGION. A
        screen reader gets the sentence, which is the information; a spinning
        ring announced as an image is noise on a screen whose entire content
        is one changing fact.
      */}
      {!slow && (
        <span
          aria-hidden="true"
          data-testid="payment-spinner"
          className="mb-4 block h-8 w-8 animate-spin rounded-full border-2 border-hairline border-t-volt"
        />
      )}

      <div role="status" aria-live="polite">
        <h1 className="m-0 font-display text-section-title uppercase tracking-wide text-volt">
          {slow ? t.payment.slowTitle : t.payment.confirmingTitle}
        </h1>
        <p className="mt-3 mb-0 text-body leading-relaxed text-bone">
          {slow ? slowBody : t.payment.confirmingBody}
        </p>
      </div>

      {/*
        THE WAY OUT APPEARS ONLY IN THE SLOW STATE. Offering it immediately
        would invite a player to leave during the two seconds the whole thing
        usually takes, and the page they would land on still says "spot held,
        waiting for payment" — which reads as a failure at the exact moment
        nothing has gone wrong.
      */}
      {slow && (
        <Link
          href={fallbackHref}
          data-testid="payment-slow-link"
          className="mt-6 inline-block text-[11px] uppercase tracking-eyebrow text-volt no-underline"
        >
          {slowLink}
        </Link>
      )}
    </section>
  );
}
