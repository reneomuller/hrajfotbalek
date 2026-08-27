"use client";

import { useEffect } from "react";

/**
 * The route error boundary (audit F4).
 *
 * THERE WAS NOT ONE. Thirty `page.tsx` files, zero `error.tsx`, no
 * `global-error.tsx` — measured across the whole app directory. This repo's
 * own rule file opens with "Every route has an Error Boundary" and explains
 * why: without one, a single render error blanks the app and the reader is
 * left looking at nothing, with no way to tell a crash from a slow page.
 *
 * ONE FILE AT THE ROOT COVERS EVERY ROUTE, because Next resolves the nearest
 * boundary upwards. A per-route boundary buys finer recovery and is worth
 * adding later where a page can fail in a way its neighbours cannot — the
 * admin surfaces are the obvious candidates. This is the floor, not the
 * ceiling.
 *
 * IT SPEAKS THE PRODUCT'S LANGUAGE, not React's. No stack, no digest on the
 * screen: a stack trace tells a player nothing and tells an attacker
 * something. `digest` goes to the console, where the server logs already
 * carry the matching entry.
 *
 * NOT TRANSLATED, AND THAT IS THE CAREFUL CHOICE. `getStrings()` reads a
 * cookie through `next/headers` and this is a client component that renders
 * precisely when something upstream has failed — reaching for the string table
 * here risks failing inside the failure handler. English, short, and the one
 * control that always works.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The boundary logs once, with the digest that matches the server entry.
    console.error("route error", { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
      <div data-testid="route-error" className="lifted rounded-card p-6">
        <h1 className="m-0 font-display text-section-title uppercase tracking-wide text-white">
          Something went wrong
        </h1>
        <p className="mt-3 mb-0 text-body leading-relaxed text-bone">
          That page did not load. It is not something you did — try again, and
          if it keeps happening the games list is still there.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            data-testid="route-error-retry"
            className="min-h-11 rounded-control bg-volt px-5 text-cta font-bold text-ink"
          >
            Try again
          </button>
          <a
            href="/games"
            data-testid="route-error-games"
            className="flex min-h-11 items-center rounded-control border border-hairline-strong px-5 text-cta font-semibold text-bone no-underline"
          >
            See what&rsquo;s on
          </a>
        </div>

        {error.digest && (
          /*
            The digest, small and last. It is the one thing that makes a report
            actionable — it matches a line in the server log — and it is not an
            apology, so it does not lead.
          */
          <p className="mt-6 mb-0 font-mono text-small text-faint">
            Reference: {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
