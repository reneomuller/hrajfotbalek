"use client";

import { useCallback, useEffect, useId, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useStrings } from "@/components/LocaleProvider";
import { LinkedText } from "@/components/form/LinkedText";
import { consentModeFor, pushDataLayer } from "@/lib/analytics/gtm";
import { consentCookieValue, makeConsent, readConsentFrom, type Consent } from "@/lib/consent";

/** The footer's "Cookie settings" link reopens the settings layer through this. */
export const CONSENT_REOPEN_EVENT = "hf:consent-reopen";

/**
 * The lawyer's cookie banner (round 40, Texty pro web 9.2–9.3), mounted only
 * while a GTM container is configured — see `app/layout.tsx`.
 *
 * TWO LAYERS. The first says what we use and offers three answers of EQUAL
 * size and weight — "Přijmout vše", "Odmítnout vše", "Nastavení" — with no fill
 * or colour favouring acceptance (9.3 names that as a forbidden pattern). The
 * second lists the categories with switches, the optional ones OFF until the
 * reader turns them on, and saves the selection or takes either extreme. There
 * is no close button: closing is not an answer, and an answer is what the
 * banner exists to get.
 *
 * PORTALLED, BECAUSE THE MODAL LAW APPLIES TO IT TOO. Every page shell is
 * `<main className="relative z-10">`, which caps anything inside it below the
 * nav pill; `createPortal` into `document.body` is the only thing that lets the
 * sheet compete on equal terms (CLAUDE.md, `CancelBookingForm`).
 *
 * NOT FOCUS-TRAPPED, ON PURPOSE: a reader who wants to finish reading the page
 * before answering should be able to, and a trapped consent banner is how a
 * keyboard user gets stuck on a page they were only visiting.
 */

/*
 * THE STORED CHOICE IS BROWSER STATE, READ WITH THE API FOR BROWSER STATE.
 *
 * `"unknown"` is the SERVER's answer and is not a choice: whether to ask
 * depends on a cookie in THIS browser, so the server renders nothing and the
 * client decides on hydration. The parsed value is CACHED per raw cookie
 * string, because `useSyncExternalStore` needs the same object back while
 * nothing changed — a fresh object per read is an infinite render loop.
 */
type Stored = Consent | null | "unknown";

let listeners: (() => void)[] = [];
let lastCookie: string | null = null;
let lastValue: Consent | null = null;

function subscribe(onChange: () => void) {
  listeners = [...listeners, onChange];
  return () => {
    listeners = listeners.filter((l) => l !== onChange);
  };
}

function notifyConsentChanged() {
  for (const l of listeners) l();
}

function getSnapshot(): Stored {
  const raw = document.cookie;
  if (raw !== lastCookie) {
    lastCookie = raw;
    lastValue = readConsentFrom(raw);
  }
  return lastValue;
}

function getServerSnapshot(): Stored {
  return "unknown";
}

type Categories = { analytics: boolean; marketing: boolean };

const NONE: Categories = { analytics: false, marketing: false };
const ALL: Categories = { analytics: true, marketing: true };

/** One look for all three answers — equal weight is the compliance property. */
const ANSWER =
  "min-h-11 flex-1 rounded-control border-[1.5px] border-hairline-strong bg-transparent px-4 py-3 text-body font-bold text-bone transition-colors hover:border-volt focus-visible:outline focus-visible:outline-2 focus-visible:outline-volt md:flex-none";

export function CookieConsent() {
  const t = useStrings();
  const titleId = useId();
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [reopened, setReopened] = useState(false);
  const [layer, setLayer] = useState<"banner" | "settings">("banner");
  const [draft, setDraft] = useState<Categories>(NONE);

  useEffect(() => {
    const reopen = () => {
      const current = readConsentFrom(document.cookie);
      setDraft(current ? { analytics: current.analytics, marketing: current.marketing } : NONE);
      setLayer("settings");
      setReopened(true);
    };
    window.addEventListener(CONSENT_REOPEN_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_REOPEN_EVENT, reopen);
  }, []);

  const choose = useCallback((categories: Categories) => {
    const consent = makeConsent(categories);
    document.cookie = consentCookieValue(consent);
    // Consent Mode first, then the event a GTM trigger can fire the Pixel on.
    window.gtag?.("consent", "update", consentModeFor(consent));
    pushDataLayer({
      event: "consent_update",
      analytics: consent.analytics,
      marketing: consent.marketing,
    });
    setReopened(false);
    setLayer("banner");
    notifyConsentChanged();
  }, []);

  const openSettings = useCallback(() => {
    setDraft(NONE);
    setLayer("settings");
  }, []);

  const open = stored !== "unknown" && (stored === null || reopened);
  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-testid="cookie-consent"
      data-layer={layer}
      className="fixed inset-x-0 bottom-0 z-[60] max-h-[85vh] overflow-y-auto border-t border-hairline bg-surface p-gutter pb-[max(theme(spacing.gutter),env(safe-area-inset-bottom))] shadow-lift"
    >
      <div className="mx-auto flex max-w-shell flex-col gap-4">
        <h2 id={titleId} className="m-0 text-[17px] font-bold uppercase tracking-wide text-white">
          {layer === "settings" ? t.consent.settingsTitle : t.consent.title}
        </h2>

        {layer === "banner" ? (
          <>
            <p className="m-0 text-body leading-relaxed text-muted">
              <LinkedText
                template={t.consent.body}
                links={{ policy: { href: "/cookies", label: t.consent.policyLink } }}
              />
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" data-testid="consent-accept-all" onClick={() => choose(ALL)} className={ANSWER}>
                {t.consent.acceptAll}
              </button>
              <button type="button" data-testid="consent-reject-all" onClick={() => choose(NONE)} className={ANSWER}>
                {t.consent.rejectAll}
              </button>
              <button type="button" data-testid="consent-open-settings" onClick={openSettings} className={ANSWER}>
                {t.consent.openSettings}
              </button>
            </div>
          </>
        ) : (
          <>
            <ul className="m-0 flex list-none flex-col gap-3 p-0" data-testid="consent-settings">
              <Category
                id="consent-necessary"
                title={t.consent.necessaryTitle}
                body={t.consent.necessaryBody}
                note={t.consent.alwaysOn}
                checked
                disabled
              />
              <Category
                id="consent-analytics"
                title={t.consent.analyticsTitle}
                body={t.consent.analyticsBody}
                checked={draft.analytics}
                onChange={(analytics) => setDraft((d) => ({ ...d, analytics }))}
              />
              <Category
                id="consent-marketing"
                title={t.consent.marketingTitle}
                body={t.consent.marketingBody}
                checked={draft.marketing}
                onChange={(marketing) => setDraft((d) => ({ ...d, marketing }))}
              />
            </ul>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" data-testid="consent-save" onClick={() => choose(draft)} className={ANSWER}>
                {t.consent.saveChoice}
              </button>
              <button type="button" data-testid="consent-accept-all" onClick={() => choose(ALL)} className={ANSWER}>
                {t.consent.acceptAll}
              </button>
              <button type="button" data-testid="consent-reject-all" onClick={() => choose(NONE)} className={ANSWER}>
                {t.consent.rejectAll}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** One category row: a native checkbox exposed as a switch, never pre-ticked. */
function Category({
  id,
  title,
  body,
  note,
  checked,
  disabled = false,
  onChange,
}: {
  id: string;
  title: string;
  body: string;
  note?: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <li className="rounded-card border border-hairline p-3">
      <label htmlFor={id} className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          role="switch"
          data-testid={id}
          checked={checked}
          disabled={disabled}
          onChange={onChange ? (event) => onChange(event.target.checked) : undefined}
          className="mt-1 h-5 w-5 shrink-0 accent-volt disabled:opacity-60"
        />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-body font-bold text-bone">
            {title}
            {note ? <span className="ml-2 text-small font-normal text-faint">{note}</span> : null}
          </span>
          <span className="text-small leading-snug text-muted">{body}</span>
        </span>
      </label>
    </li>
  );
}
