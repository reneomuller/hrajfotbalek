/**
 * Google Maps share links, resolved into something the venue can store
 * (round 30, item 4).
 *
 * WHY THIS FAILED THE OWNER, ROOT-CAUSED RATHER THAN GUESSED: **it was never
 * built.** Round 28 listed it as item 8 and shipped ledger row 218 saying
 * `OPEN — NOT ATTEMPTED THIS ROUND`. There was no resolver to be broken. The
 * venue's "Map search" field is a plain text box whose contents are dropped
 * into a Google Maps query string — so pasting `https://maps.app.goo.gl/abc123`
 * made the QUERY the literal URL text, and Maps searched for that string as
 * words. It lands nowhere, and it looks like a broken feature rather than an
 * absent one, which is exactly why it got reported three times.
 *
 * TWO SHAPES ARRIVE FROM THE SHARE SHEET and both must work:
 *
 *   https://maps.app.goo.gl/AbCdEf123   — the short link "Copy link" gives
 *   https://www.google.com/maps/place/… — the long URL the browser shows
 *
 * The short one carries NO coordinates at all; it is an opaque key that only
 * Google can expand. So resolving it means a network round trip, and that is
 * the whole reason this is split: everything here is pure and unit-tested, and
 * the one impure step takes its `fetch` as an argument.
 */

/**
 * Hosts this resolver will follow. **An allow-list, not a block-list**, and it
 * is the security boundary rather than tidiness: the input is admin-supplied
 * text that becomes a server-side HTTP request, which is an SSRF primitive if
 * it can be pointed anywhere. `169.254.169.254` is a metadata endpoint on every
 * major cloud; a block-list that forgot it would be worth nothing.
 */
const ALLOWED_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "maps.google.com",
  "www.google.com",
  "google.com",
  "www.google.cz",
  "google.cz",
]);

/** How long the redirect chase may take before we give up and say so. */
export const RESOLVE_TIMEOUT_MS = 5_000;

/** How many hops to follow. Google usually takes one; five is slack. */
export const MAX_REDIRECTS = 5;

/**
 * How much of an HTML interstitial to read.
 *
 * SHORT LINKS DO NOT ALWAYS 302 — verified against the live endpoint, which
 * answered **200 with no `location` header** and 34 KB of HTML. So the body is
 * a second transport for the same answer, and it is read with a CAP: an
 * unbounded `text()` on an admin-supplied URL is a memory denial-of-service
 * with extra steps.
 */
export const MAX_BODY_BYTES = 512 * 1024;

export interface Coordinates {
  lat: number;
  lng: number;
}

/** Does this look like a Maps URL at all, as opposed to a place name? */
export function isMapsUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  try {
    return ALLOWED_HOSTS.has(new URL(trimmed).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** A short link that carries no coordinates and must be expanded first. */
export function isShortMapsUrl(value: string): boolean {
  const trimmed = value.trim();
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    return host === "maps.app.goo.gl" || host === "goo.gl";
  } catch {
    return false;
  }
}

/**
 * Pull coordinates out of an EXPANDED Google Maps URL.
 *
 * FOUR PLACES GOOGLE PUTS THEM, tried in descending order of trustworthiness:
 *
 *   1. `!3d<lat>!4d<lng>` — the `data=` blob's place coordinates. This is the
 *      PIN itself and is the one to prefer.
 *   2. `?q=<lat>,<lng>` / `?query=` — an explicit query pair.
 *   3. `/@<lat>,<lng>,<zoom>z` — the VIEWPORT centre. Close to the pin but not
 *      identical, which is why it loses to both of the above: a share link
 *      opened after panning has a viewport that is not the place.
 *   4. `/place/<name>/` — no coordinates at all; the name is returned instead
 *      so the map can search for it, which is what the field did originally.
 */
export function parseMapsUrl(url: string): Coordinates | { place: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  const whole = parsed.href;

  const pin = whole.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (pin) {
    const coords = { lat: Number(pin[1]), lng: Number(pin[2]) };
    if (validCoordinates(coords)) return coords;
  }

  const q = parsed.searchParams.get("q") ?? parsed.searchParams.get("query");
  if (q) {
    const pair = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (pair) {
      const coords = { lat: Number(pair[1]), lng: Number(pair[2]) };
      if (validCoordinates(coords)) return coords;
    }
  }

  const at = whole.match(/\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at) {
    const coords = { lat: Number(at[1]), lng: Number(at[2]) };
    if (validCoordinates(coords)) return coords;
  }

  const place = whole.match(/\/maps\/place\/([^/@?]+)/);
  if (place) {
    const name = decodeURIComponent(place[1]!.replace(/\+/g, " ")).trim();
    if (name) return { place: name };
  }

  return null;
}

/**
 * ZERO,ZERO IS REFUSED, and that is not pedantry. It is in the Gulf of Guinea,
 * it is what a failed parse of an empty capture produces, and storing it would
 * put every unresolvable venue in the same wrong place rather than reporting a
 * failure.
 */
function validCoordinates({ lat, lng }: Coordinates): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/** What the venue stores: Maps accepts a `lat,lng` pair as a search query. */
export function toMapQuery(result: Coordinates | { place: string }): string {
  if ("place" in result) return result.place;
  // Six decimals is ~11cm. More is noise; fewer moves the pin off the pitch.
  return `${round6(result.lat)},${round6(result.lng)}`;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * The destination hiding in an interstitial's HTML.
 *
 * THREE PLACES, in descending order of how much they mean:
 *   a `<meta http-equiv="refresh">` target, which is an explicit instruction;
 *   a `<link rel="canonical">`, which names the real page;
 *   any embedded `google.com/maps` URL, which is the last resort.
 *
 * A CANONICAL POINTING AT ITSELF IS IGNORED by the caller's `!== current`
 * check — Google's "this link is not valid" page canonicalises to the short
 * URL you just asked for, and following it would loop.
 */
async function destinationFromBody(response: Response): Promise<string | null> {
  let html: string;
  try {
    const raw = await response.arrayBuffer();
    html = new TextDecoder().decode(raw.slice(0, MAX_BODY_BYTES));
  } catch {
    return null;
  }

  const refresh = html.match(/http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"']+)["']/i);
  if (refresh?.[1]) return decodeHtml(refresh[1].trim());

  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  if (canonical?.[1]) return decodeHtml(canonical[1].trim());

  const embedded = html.match(/https:\/\/(?:www\.)?google\.[a-z.]{2,6}\/maps\/[^"'\\ <]+/i);
  if (embedded?.[0]) return decodeHtml(embedded[0]);

  return null;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#47;/g, "/")
    .replace(/\\u003d/gi, "=")
    .replace(/\\u0026/gi, "&");
}

export type ResolveOutcome =
  | { ok: true; mapQuery: string; from: "coordinates" | "place" }
  | { ok: false; reason: "not-a-link" | "unreachable" | "unparseable" };

/**
 * Expand a share link and read the place out of it.
 *
 * THE `fetch` IS INJECTED so every branch above is testable without a network,
 * and so the caller decides the runtime. `redirect: "manual"` rather than
 * `"follow"`: we want to inspect each hop's `location` and re-check it against
 * the allow-list, because a permitted host is free to redirect somewhere that
 * is not — and `"follow"` would chase it for us with no say.
 */
export async function resolveMapsShareLink(
  raw: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ResolveOutcome> {
  const input = raw.trim();
  if (!isMapsUrl(input)) return { ok: false, reason: "not-a-link" };

  let current = input;

  // A long URL may already carry everything we need; try before the network.
  const direct = parseMapsUrl(current);
  if (direct && !isShortMapsUrl(current)) {
    return { ok: true, mapQuery: toMapQuery(direct), from: "place" in direct ? "place" : "coordinates" };
  }

  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    let response: Response;
    try {
      response = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
        headers: {
          // Google serves a coordinate-bearing URL to a browser-ish client and
          // a consent interstitial to something that looks automated.
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          "accept-language": "en",
        },
      });
    } catch {
      return { ok: false, reason: "unreachable" };
    }

    const location = response.headers.get("location");

    /*
     * NO `location` IS NOT THE END OF THE ROAD (round 30, item 4).
     *
     * The live `maps.app.goo.gl` endpoint answers 200 with an HTML
     * interstitial rather than an HTTP redirect — checked against the real
     * service, not assumed — so the destination has to be read out of the
     * body. The first draft of this resolver broke here and would have failed
     * the owner a fourth time on exactly the link shape he uses.
     */
    if (!location) {
      const fromBody = await destinationFromBody(response);
      if (fromBody && isMapsUrl(fromBody) && fromBody !== current) {
        current = fromBody;
        const inBody = parseMapsUrl(current);
        if (inBody) {
          return {
            ok: true,
            mapQuery: toMapQuery(inBody),
            from: "place" in inBody ? "place" : "coordinates",
          };
        }
        continue;
      }
      break;
    }

    let next: string;
    try {
      next = new URL(location, current).href;
    } catch {
      return { ok: false, reason: "unparseable" };
    }

    // RE-CHECKED EVERY HOP. An allowed host may redirect to a disallowed one.
    if (!isMapsUrl(next)) return { ok: false, reason: "unparseable" };

    current = next;
    const found = parseMapsUrl(current);
    if (found) {
      return { ok: true, mapQuery: toMapQuery(found), from: "place" in found ? "place" : "coordinates" };
    }
  }

  const last = parseMapsUrl(current);
  if (last) {
    return { ok: true, mapQuery: toMapQuery(last), from: "place" in last ? "place" : "coordinates" };
  }

  return { ok: false, reason: "unparseable" };
}
