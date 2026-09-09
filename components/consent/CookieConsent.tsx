"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useStrings } from "@/components/LocaleProvider";
import {
  consentCookieValue,
  readConsentFrom,
  type ConsentChoice,
} from "@/lib/consent";

/** The footer's "Cookie settings" link reopens the sheet through this. */
export const CONSENT_REOPEN_EVENT = "hf:consent-reopen";

/**
 * The consent sheet (round 28, item 1).
 *
 * PORTALLED, BECAUSE THE MODAL LAW APPLIES TO IT TOO. `z-50` is a rank WITHIN
 * a stacking context, and every page shell here is `<main className="relative
 * z-10">` — which caps anything inside it below the nav pill at `z-40` and the
 * claim bar at `z-30`. A consent sheet rendered in the tree would sit visible,
 * enabled and covered on exactly the pages where somebody is trying to book.
 * `createPortal` into `document.body` is the only thing that lets it compete
 * on equal terms. See `CancelBookingForm` for the worked example and the
 * `elementFromPoint` diagnosis that found it.
 *
 * IT NEVER RENDERS ON THE SERVER, which is not a hydration dodge but the
 * correct reading of the state: whether to ask depends on a cookie in THIS
 * browser, and a server render that guessed would flash the banner at somebody
 * who answered months ago. The server snapshot below is what enforces it.
 *
 * A BOTTOM SHEET ON MOBILE AND A BOTTOM SHEET ON DESKTOP, deliberately the
 * same: it is the one shape that never covers the thing being read, and the
 * product's other overlay at the bottom edge — the claim bar — has already
 * taught readers that the bottom of the screen is where a decision appears.
 * It sits ABOVE the claim bar, because until it is answered it is the only
 * thing on screen that should take a tap.
 */
/*
 * THE STORED CHOICE IS BROWSER STATE, READ WITH THE API FOR BROWSER STATE.
 *
 * The obvious shape — `useEffect(() => setOpen(readCookie()))` — is a
 * synchronous `setState` inside an effect, which cascades a second render on
 * every mount and which this project's lint rule refuses. It is also the wrong
 * tool: nothing is being SYNCHRONISED here, a value is being READ from outside
 * React, and `useSyncExternalStore` is exactly that with a server snapshot
 * built in.
 *
 * `"unknown"` IS THE SERVER'S ANSWER AND IS NOT A CHOICE. It has to be
 * distinct from `null`: null means "this reader has not answered and we should
 * ask", and rendering that during SSR would call `createPortal` where there is
 * no `document`. The server says "unknown", renders nothing, and the client
 * replaces it on hydration.
 */
type StoredChoice = ConsentChoice | null | "unknown";

let listeners: (() => void)[] = [];

function subscribe(onChange: () => void) {
  listeners = [...listeners, onChange];
  return () => {
    listeners = listeners.filter((l) => l !== onChange);
  };
}

/** Re-read after we write, so the sheet closes without a second source of truth. */
function notifyConsentChanged() {
  for (const l of listeners) l();
}

function getSnapshot(): StoredChoice {
  return readConsentFrom(document.cookie);
}

function getServerSnapshot(): StoredChoice {
  return "unknown";
}

export function CookieConsent() {
  const t = useStrings();
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [reopened, setReopened] = useState(false);

  useEffect(() => {
    const reopen = () => setReopened(true);
    window.addEventListener(CONSENT_REOPEN_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_REOPEN_EVENT, reopen);
  }, []);

  const choose = useCallback((choice: ConsentChoice) => {
    document.cookie = consentCookieValue(choice);
    setReopened(false);
    notifyConsentChanged();
  }, []);

  // Never on the server; otherwise ask when unanswered, or when asked back.
  const open = stored !== "unknown" && (stored === null || reopened);

  if (!open) return null;

  return createPortal(
    /*
     * `role="dialog"` AND NOT `alertdialog`: this interrupts nothing and has no
     * error in it. It is not focus-trapped and must not be — a reader who
     * wants to finish reading the page before answering should be able to, and
     * trapping focus in a consent banner is how a keyboard user gets stuck on
     * a page they were only visiting.
     */
    <div
      role="dialog"
      aria-modal="false"
      aria-label={t.consent.title}
      data-testid="cookie-consent"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-hairline bg-surface p-gutter pb-[max(theme(spacing.gutter),env(safe-area-inset-bottom))] shadow-lift"
    >
      <div className="mx-auto flex max-w-shell flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h2 className="m-0 text-[17px] font-bold uppercase tracking-wide text-white">
            {t.consent.title}
          </h2>
          <p className="mt-2 mb-0 text-body leading-relaxed text-muted">
            {t.consent.body}
          </p>
        </div>

        {/*
          THE TWO ANSWERS CARRY EQUAL WEIGHT, and that is a compliance property
          rather than a taste one: a refusal styled as a faint text link beside
          a filled accept button is a dark pattern with a name. Both are real
          buttons at the same size; only the fill differs, and it differs the
          way every primary/secondary pair in this product does.
        */}
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            data-testid="consent-necessary"
            onClick={() => choose("necessary")}
            className="flex-1 rounded-control border-[1.5px] border-hairline bg-transparent px-4 py-3 text-body font-bold text-bone md:flex-none"
          >
            {t.consent.onlyNecessary}
          </button>
          <button
            type="button"
            data-testid="consent-accept-all"
            onClick={() => choose("all")}
            className="flex-1 rounded-control bg-volt px-4 py-3 text-body font-bold text-surface md:flex-none"
          >
            {t.consent.acceptAll}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
