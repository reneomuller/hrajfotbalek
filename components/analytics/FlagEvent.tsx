"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { pushDataLayer } from "@/lib/analytics/gtm";

/**
 * Pushes server-computed events exactly once, on a page the server marked with
 * a one-time flag (`lib/analytics/gtm.ts` · `ANALYTICS_FLAGS`), then removes the
 * flag with `history.replaceState` so a refresh or a back-navigation cannot
 * push again. The same shape as `SignUpEvent`, for events whose payload only
 * the server knows (a booking, a payment).
 *
 * `events` is rendered by a Server Component; it is pushed only while `flag`
 * is still in the address bar, so the component can sit on the page always.
 * Several flags can be stripped at once (`flags`), so a card booking that
 * arrives with `booked` and `paid` pushes both events and leaves neither.
 */
export function FlagEvent({ flags, events }: { flags: string[]; events: Record<string, unknown>[] }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const handled = useRef<string | null>(null);
  const flagged = flags.some((f) => params.has(f));

  useEffect(() => {
    if (!flagged || events.length === 0) return;
    const here = `${pathname}?${params.toString()}`;
    if (handled.current === here) return;
    handled.current = here;

    for (const e of events) {
      // GA4 merges ecommerce objects across pushes unless the last one is cleared.
      if ("ecommerce" in e) pushDataLayer({ ecommerce: null });
      pushDataLayer(e);
    }

    const rest = new URLSearchParams(params.toString());
    for (const f of flags) rest.delete(f);
    const query = rest.toString();
    window.history.replaceState(null, "", `${pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, [flagged, events, flags, params, pathname]);

  return null;
}
