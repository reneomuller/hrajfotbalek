import type { MetadataRoute } from "next";

/**
 * How the site presents itself to search engines (2026-11-06, the owner: "the
 * website doesn't show the logo on the web ... and the header beneath the
 * clickable link — could we have a different text there that reflects the
 * homepage?").
 *
 * PURE, taking the site's origin, so the three route files (`app/robots.ts`,
 * `app/sitemap.ts`, the home page's JSON-LD) only resolve the origin and hand
 * it over.
 */

const SITE_NAME = "Hraj Fotbal";

/**
 * The home page's JSON-LD: a WebSite (the site name a result shows) and an
 * Organization (the logo). The logo is the 512px icon the PWA manifest already
 * serves — square, and well over the 112px floor search engines ask for.
 */
export function homeStructuredData(site: string) {
  const url = `${site}/`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", name: SITE_NAME, alternateName: "HrajFotbal", url },
      { "@type": "Organization", name: SITE_NAME, url, logo: `${site}/icons/icon-512.png` },
    ],
  };
}

/**
 * robots.txt. Before this, `/robots.txt` answered with the site's HTML page
 * and a 200 — the soft 404 CLAUDE.md describes — which a crawler reads as an
 * unparseable file.
 */
export function robotsFor(site: string): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api", "/account", "/my-games", "/payment"],
    },
    sitemap: `${site}/sitemap.xml`,
  };
}

/**
 * The public pages a search engine should know about. Game pages are not
 * listed: they live a week and are reached from the games list, which is.
 */
const PUBLIC_PATHS = ["/", "/games", "/pass", "/signup", "/contact", "/terms", "/privacy", "/cookies"];

export function sitemapFor(site: string): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: path === "/" ? `${site}/` : `${site}${path}`,
    changeFrequency: path === "/" || path === "/games" ? "daily" : "monthly",
    priority: path === "/" ? 1 : path === "/games" ? 0.9 : 0.5,
  }));
}
