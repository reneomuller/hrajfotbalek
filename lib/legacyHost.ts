/**
 * THE OLD ADDRESS FORWARDS TO THE NEW ONE (owner, 2026-10-28).
 *
 * "When navigating the hrajfotbal.com site, some people still end up on the
 * hrajfotbalek web." The Vercel production aliases kept serving a full copy of
 * the site, and anything that still pointed at them — Supabase's Site URL,
 * which every auth email's link was built from, old WhatsApp posts, bookmarks,
 * home-screen installs — put a player there, where every later click stayed.
 *
 * The owner keeps the old address on purpose, "just in case i missed updating
 * the adress somewhere" — so it is not removed, it FORWARDS: same path, same
 * query (a sign-in link's `token_hash` must survive the hop), permanently.
 *
 * NOT `/api/`. Stripe's webhook may still be registered on the old address,
 * and Stripe does not follow a redirect — a forwarded webhook is a payment
 * nobody confirms. Deployment and preview URLs are not in the list either:
 * they are how a build is inspected before it is promoted.
 */
export const LEGACY_HOSTS = [
  "hrajfotbalek-wlya.vercel.app",
  "hrajfotbalek-wlya-reneomuller-7550s-projects.vercel.app",
  "hrajfotbalek-wlya-git-main-reneomuller-7550s-projects.vercel.app",
] as const;

const UNFORWARDED_PREFIXES = ["/api/", "/_next/"] as const;

/** Where a request to an old address belongs, or null to serve it as it is. */
export function legacyHostRedirect(
  host: string | null,
  pathname: string,
  search: string,
  siteUrl: string | undefined,
): string | null {
  const site = siteUrl?.replace(/\/$/, "");
  if (!site || !host) return null;
  const hostname = host.toLowerCase().replace(/:\d+$/, "");
  if (!(LEGACY_HOSTS as readonly string[]).includes(hostname)) return null;
  if (UNFORWARDED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;
  return `${site}${pathname}${search}`;
}
