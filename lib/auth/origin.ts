import { headers } from "next/headers";

/**
 * The origin an emailed credential must come back to.
 *
 * Extracted from `app/login/actions.ts` when signup grew its own email: two
 * copies of this function is two chances to get the PKCE cookie-jar rule wrong,
 * and the one that drifts is always the newer caller.
 *
 * IT MUST MATCH THE ORIGIN THE BROWSER IS ON. The PKCE code verifier lives in a
 * cookie, and cookies are scoped to a host — so if the link returns to a
 * different one, the verifier is simply not sent and the exchange fails with
 * "code verifier not found in storage". `localhost`, `127.0.0.1` and a LAN IP
 * are three separate cookie jars in one browser, which is exactly how this
 * looks like a working login that silently ends with no session.
 */
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const requestOrigin = `${proto}://${host}`;

  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!configured) return requestOrigin;

  // Loud, because the resulting failure is otherwise indistinguishable from a
  // link that simply expired.
  if (new URL(configured).host !== host) {
    console.error(
      `NEXT_PUBLIC_SITE_URL (${configured}) does not match the host this request ` +
        `arrived on (${host}). The emailed link will return to a different origin ` +
        `than the one holding the PKCE code verifier cookie, and the exchange ` +
        `will fail. Browse the app on ${configured}, or unset NEXT_PUBLIC_SITE_URL.`,
    );
  }

  return configured;
}
