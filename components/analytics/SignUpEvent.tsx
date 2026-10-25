"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { SIGNED_UP_PARAM, pushDataLayer } from "@/lib/analytics/gtm";

/**
 * Pushes `{ event: 'sign_up' }` exactly once, on the first page after an
 * account was created (round 40, plan step 7).
 *
 * The server marks that page with `?signed_up=1` (`signedUpDestination`); this
 * reads the flag, pushes, and removes it with `history.replaceState`, so a
 * refresh or a back-navigation cannot count the same person twice. The ref is
 * the guard against React's development double-run of effects.
 *
 * Pushed whatever the reader consented to: the event is a fact about the page,
 * and GTM's tags decide — under Consent Mode — whether anything is sent.
 */
export function SignUpEvent() {
  const params = useSearchParams();
  const pathname = usePathname();
  const handled = useRef<string | null>(null);
  const flagged = params.get(SIGNED_UP_PARAM) === "1";

  useEffect(() => {
    if (!flagged) return;
    const here = `${pathname}?${params.toString()}`;
    if (handled.current === here) return;
    handled.current = here;

    pushDataLayer({ event: "sign_up" });

    const rest = new URLSearchParams(params.toString());
    rest.delete(SIGNED_UP_PARAM);
    const query = rest.toString();
    window.history.replaceState(null, "", `${pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, [flagged, params, pathname]);

  return null;
}
