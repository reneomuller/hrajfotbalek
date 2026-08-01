/**
 * The toast vocabulary, as a closed set (§8, REQ-UX-002).
 *
 * A CLOSED SET RATHER THAN FREE TEXT, for the same reason `games.surface` is:
 * a toast is copy, copy lives in `lib/strings.ts`, and a component that
 * accepts an arbitrary message is a component through which a hardcoded
 * English string reaches the screen in Czech. The kind is what travels — in a
 * URL, across a redirect — and the words are resolved at the render site from
 * the reader's own locale.
 *
 * THAT MATTERS BECAUSE MOST OF THESE CROSS A NAVIGATION. "Booking created"
 * fires on a page the server renders after a redirect; the acting request and
 * the rendering request are different requests. Passing the kind through the
 * URL and resolving it on arrival is what makes that survive — and it is also
 * why the set is closed: an unrecognised kind renders nothing rather than
 * whatever a query string said.
 */
export const TOAST_KINDS = [
  "bookingCreated",
  "signedIn",
  "bookingCancelled",
  "topupConfirmed",
  "linkCopied",
] as const;

export type ToastKind = (typeof TOAST_KINDS)[number];

/** The query parameter a redirect carries a toast in. */
export const TOAST_PARAM = "toast";

export function isToastKind(value: unknown): value is ToastKind {
  return typeof value === "string" && (TOAST_KINDS as readonly string[]).includes(value);
}

/**
 * Reads a toast out of a `searchParams` bag, or null.
 *
 * Returns null for anything unrecognised rather than throwing: a stale or
 * hand-edited URL should render a page with no toast, not an error page.
 */
export function readToast(
  query: Record<string, string | string[] | undefined>,
): ToastKind | null {
  const raw = query[TOAST_PARAM];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return isToastKind(value) ? value : null;
}

/** Appends the toast parameter to a path a redirect is about to send. */
export function withToast(path: string, kind: ToastKind): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${TOAST_PARAM}=${kind}`;
}
