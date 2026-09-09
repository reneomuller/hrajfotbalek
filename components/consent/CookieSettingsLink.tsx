"use client";

import { useStrings } from "@/components/LocaleProvider";
import { CONSENT_REOPEN_EVENT } from "@/components/consent/CookieConsent";

/**
 * "Cookie settings" in the footer — the way back to a decision already made
 * (round 28, item 1).
 *
 * A CONSENT BANNER THAT CANNOT BE REOPENED IS A ONE-WAY DOOR, and "I clicked
 * the wrong one and now I cannot change it" is the complaint that follows. The
 * banner hides itself once answered, so this is the only route back to it.
 *
 * A CUSTOM EVENT RATHER THAN SHARED STATE, and the reason is where these two
 * live: the sheet is portalled into `document.body` from wherever the layout
 * mounts it, and this link is inside a server-rendered footer several levels
 * away. Lifting state to a common ancestor would mean a provider wrapping the
 * whole application to carry one boolean between two leaves — which is exactly
 * the "hoist everything into context" anti-pattern. One event on `window`,
 * listened for by the one component that owns the state.
 *
 * A REAL `<button>`: it performs an action on this page rather than navigating,
 * so it is not a link, and it gets keyboard and focus behaviour for free.
 */
export function CookieSettingsLink() {
  const t = useStrings();

  return (
    <button
      type="button"
      data-testid="cookie-settings"
      onClick={() => window.dispatchEvent(new Event(CONSENT_REOPEN_EVENT))}
      className="cursor-pointer border-0 bg-transparent p-0 text-left text-small text-faint underline-offset-2 hover:underline"
    >
      {t.consent.settings}
    </button>
  );
}
