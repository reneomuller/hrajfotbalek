import { CONSENT_COOKIE, type Consent } from "@/lib/consent";

/**
 * Google Tag Manager — the one place GA4 and the Meta Pixel live (round 40).
 *
 * THE APP CARRIES NO GA4 OR META CODE. It loads one GTM container, tells it
 * what the reader consented to, and pushes the events only the app can see
 * (`sign_up`). Every tag is configured in GTM, by the owner.
 *
 * DARK UNTIL `NEXT_PUBLIC_GTM_ID` IS SET. With no container there is nothing to
 * consent to, so the banner, the footer's "Cookie settings", the consent
 * defaults, the cookie-policy rows and the sign-up flag all stay off — Texty
 * pro web 9.1: no banner while only necessary cookies are used.
 */

const CONTAINER_ID = /^GTM-[A-Z0-9]{4,}$/;

/** The container id, or null when it is unset or not a GTM id at all. */
export function gtmContainerId(raw: string | undefined = process.env.NEXT_PUBLIC_GTM_ID): string | null {
  const value = raw?.trim() ?? "";
  return CONTAINER_ID.test(value) ? value : null;
}

export function gtmEnabled(): boolean {
  return gtmContainerId() !== null;
}

type Signal = "granted" | "denied";

export interface ConsentMode {
  analytics_storage: Signal;
  ad_storage: Signal;
  ad_user_data: Signal;
  ad_personalization: Signal;
}

/**
 * Google Consent Mode v2 from a stored choice. Analytics is GA4; marketing is
 * the three advertising signals together, which is what the Meta Pixel tag in
 * GTM checks before it fires.
 */
export function consentModeFor(consent: Consent | null): ConsentMode {
  const analytics: Signal = consent?.analytics ? "granted" : "denied";
  const marketing: Signal = consent?.marketing ? "granted" : "denied";
  return {
    analytics_storage: analytics,
    ad_storage: marketing,
    ad_user_data: marketing,
    ad_personalization: marketing,
  };
}

/**
 * The inline script that runs BEFORE the GTM container (next/script
 * `beforeInteractive`): every signal denied, then the stored choice applied if
 * there is one. `gtag` pushes `arguments`, not an array — that is the shape GTM
 * reads consent commands in.
 *
 * Self-contained on purpose: it runs before any bundle has loaded, so it
 * re-reads the cookie itself. It understands only the round-40 JSON value;
 * anything else — a round-28 "all", a garbled value — stays at denied, which is
 * also what `parseConsent` says.
 */
export function consentBootstrapScript(): string {
  return `(function(w,d){
w.dataLayer=w.dataLayer||[];
function gtag(){w.dataLayer.push(arguments);}
w.gtag=gtag;
gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});
try{
var m=('; '+d.cookie).split('; ${CONSENT_COOKIE}=');
if(m.length<2)return;
var c=JSON.parse(decodeURIComponent(m[1].split(';')[0]));
if(typeof c!=='object'||c===null||typeof c.analytics!=='boolean'||typeof c.marketing!=='boolean')return;
var a=c.analytics?'granted':'denied',k=c.marketing?'granted':'denied';
gtag('consent','update',{analytics_storage:a,ad_storage:k,ad_user_data:k,ad_personalization:k});
}catch(e){}
})(window,document);`;
}

/** The query flag that marks the first page after an account was created. */
export const SIGNED_UP_PARAM = "signed_up";

/**
 * Marks a post-sign-up redirect so the browser can push `sign_up` once.
 *
 * A URL FLAG, NOT A COOKIE. The account is created in three places, one of
 * them a Server Component (`app/signup/page.tsx`), and a Server Component may
 * not set a cookie (CLAUDE.md — it took checkout down once). A flag in the URL
 * also stores nothing on the device, so it needs no consent of its own; the
 * browser removes it with `history.replaceState` once it has been read.
 */
export function withSignedUp(path: string): string {
  const hashAt = path.indexOf("#");
  const base = hashAt === -1 ? path : path.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : path.slice(hashAt);
  const joiner = base.includes("?") ? "&" : "?";
  return `${base}${joiner}${SIGNED_UP_PARAM}=1${hash}`;
}

/** `withSignedUp` only while a container is configured — otherwise the path as it was. */
export function signedUpDestination(path: string): string {
  return gtmEnabled() ? withSignedUp(path) : path;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Pushes one event to GTM's dataLayer; a no-op on the server. */
export function pushDataLayer(entry: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(entry);
}
