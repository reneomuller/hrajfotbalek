import { headers } from "next/headers";

/**
 * The absolute origin this deployment is reached on.
 *
 * Open Graph `content` values and the `.ics` URL field must be absolute —
 * WhatsApp will not resolve a relative image path, and a relative URL in a
 * calendar entry is meaningless once the file leaves the browser.
 *
 * Mirrors the resolution order `app/login/actions.ts` uses for magic links:
 * the configured `NEXT_PUBLIC_SITE_URL` wins, falling back to the request's
 * own host so LAN and tunnel testing works without configuration.
 */
export async function siteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
