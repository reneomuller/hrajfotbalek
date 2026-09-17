import type { NextConfig } from "next";

/**
 * The Supabase storage origin, for the image optimizer's allow-list.
 *
 * Parsed defensively: this file is evaluated at build time and in the edge
 * runtime, and a malformed or absent URL must degrade to "optimize nothing"
 * rather than throw — an unoptimized photo is a slow page, a throwing config is
 * no page at all.
 */
const supabaseStorage = (() => {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    if (!url.hostname) return null;
    /*
     * THE PROTOCOL AND PORT COME FROM THE URL TOO, and that is not tidiness.
     *
     * A first version of this hardcoded `protocol: "https"` on the reasoning
     * that production is https — which it is. THE LOCAL STACK IS NOT: Supabase
     * serves storage from `http://127.0.0.1:54321`, so every page carrying a
     * photo threw `Invalid src prop … hostname "127.0.0.1" is not configured`
     * and rendered the error boundary. It would have deployed perfectly and
     * broken every developer and the whole E2E suite, which is the same shape
     * as the `outputFileTracingIncludes` note above: correct in one environment
     * and catastrophic in the other, with nothing in between to notice.
     */
    return {
      protocol: url.protocol.replace(":", "") as "http" | "https",
      hostname: url.hostname,
      port: url.port,
    };
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  /**
   * Ship `content/` with the server bundle.
   *
   * `/terms` reads its markdown at request time with
   * `readFileSync(path.resolve(process.cwd(), "content", …))`. Next's
   * dependency tracing follows imports, and that path is assembled at runtime —
   * so nothing tells the build those files are needed, and the deployed
   * function gets a `content/` directory that does not exist.
   *
   * Worth a config entry rather than a comment because of how it fails: it
   * works perfectly under `next dev`, where the whole repo is on disk, and
   * 500s the first time someone opens the terms in production. No test that
   * runs locally can see it.
   */
  outputFileTracingIncludes: {
    "/terms": ["./content/**"],
  },

  /**
   * VENUE AND PROFILE PHOTOS GO THROUGH THE OPTIMIZER (round 37, item 2).
   *
   * MEASURED FIRST. The games list served **1.03 MB across four images**, every
   * one of them the raw upload straight from Supabase storage: venue photos are
   * stored at 1600x740 (that is `CROP_OUTPUT.venue`, and it is the right size to
   * STORE) and were being painted into a 358x159 card, and a 512x512 avatar into
   * a 28px circle. One venue file alone was 429 KB.
   *
   * `remotePatterns` rather than `domains`: `domains` is deprecated and matches
   * a whole host, where this matches the host AND the public storage path, so a
   * signed or private object URL cannot be fed through the optimizer by
   * assembling a `/_next/image` link by hand.
   *
   * THE HOST IS DERIVED FROM THE ENV VAR, not written out. Two copies of a
   * project ref is one to forget on the day it moves, and the variable is
   * already required for the app to boot at all.
   */
  images: {
    remotePatterns: [
      ...(supabaseStorage
        ? [
            {
              protocol: supabaseStorage.protocol,
              hostname: supabaseStorage.hostname,
              port: supabaseStorage.port,
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : []),
    ],
    /*
     * THE SIZES THIS PRODUCT ACTUALLY RENDERS, rather than Next's defaults.
     *
     * The default `deviceSizes` starts at 640 and climbs to 3840 — sensible for
     * a desktop-first site and wrong for this one, which is a 390px mobile
     * product whose widest image slot is a full-bleed card. `imageSizes` covers
     * the avatars, which are the other end entirely: 28-44px rendered, so 64 and
     * 96 are the two that matter at 1x and 2x.
     */
    deviceSizes: [390, 640, 828, 1080, 1200],
    imageSizes: [32, 48, 64, 96, 128, 256],
    /*
     * A YEAR, because these URLs are CONTENT-ADDRESSED in practice: a venue's
     * photo path changes when the photo changes (the uploader writes a new
     * object key), so a stale optimized copy cannot outlive the image it is of.
     */
    minimumCacheTTL: 31536000,
    /*
     * THE OPTIMIZER IS OFF OUTSIDE PRODUCTION, AND IT IS NOT A CHOICE.
     *
     * Next's optimizer REFUSES ANY UPSTREAM THAT RESOLVES TO A PRIVATE IP —
     * `upstream image … resolved to private ip ["127.0.0.1"]` — which is a
     * correct SSRF guard and which makes the local Supabase stack permanently
     * unfetchable. It cannot be allow-listed around: three attempts at naming
     * the host, the port and then any host at all all failed the same way,
     * because the refusal happens after the pattern matches, on the resolved
     * address.
     *
     * It surfaces as `400 "url" parameter is not allowed` at the browser, so
     * the message names the allow-list and the cause is somewhere else
     * entirely. Left alone, every venue photo and every avatar in development
     * and in the whole E2E suite would silently never load.
     *
     * `unoptimized` in dev emits exactly the `src` that was passed, which is
     * what these components rendered before this round — so local behaviour is
     * unchanged and the specs see what they have always seen. `priority` and
     * `loading` still apply, because those are attributes on the element rather
     * than instructions to the optimizer.
     *
     * WHAT THIS COSTS, stated rather than buried: the E2E suite does not
     * exercise the optimizer path. The resizing is therefore verified on
     * production by measurement — see the round 37 report's before/after bytes
     * — and not by a spec. A spec that could run it would need a public image
     * host in CI, which is a bigger change than the thing it would be proving.
     */
    unoptimized: process.env.NODE_ENV !== "production",
  },

  /**
   * `/football/*` resolves onto the existing routes (§9, REQ-CUT-001).
   *
   * A REWRITE, not a move: no route file changes path, so every link already
   * shared — and every `.ics` and OG URL already in someone's calendar or chat
   * history — keeps resolving unchanged. The namespace is reserved for the next
   * sport (`/volleyball`) by making it real now, while there is one sport and
   * the cost of being wrong is a config line.
   *
   * Both shapes therefore render the same page. `/football/*` is an ALIAS, and
   * the unprefixed path stays canonical: the app's own `<Link>`s are unprefixed,
   * so a player who enters at `/football` leaves the namespace on their first
   * tap. That is deliberate for this phase — prefixing every internal link is a
   * second change with its own failure mode, and nothing in §9 requires the
   * namespace to be sticky before a second sport exists. Recorded for the gate.
   *
   * `beforeFiles` rather than the default `afterFiles`: an `afterFiles` rewrite
   * runs only when nothing else matched, so `/football/games` would 404 against
   * the filesystem before it was ever offered the rewrite.
   */
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/football", destination: "/" },
        { source: "/football/:path*", destination: "/:path*" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },

  /**
   * `/` lands on `/football` — on the new host ONLY (§9, REQ-CUT-002).
   *
   * The host is matched literally rather than derived from
   * `NEXT_PUBLIC_SITE_URL` because of what this phase is allowed to do: §9 says
   * nothing here touches production DNS, and a rule keyed on the env var would
   * start redirecting the CURRENT origin's root the moment it deployed. Keyed on
   * a host that does not resolve yet, the rule is inert until the human cutover
   * makes it true, and no further deploy is needed at the moment it does.
   *
   * TEMPORARY (307), not permanent. A 308 is cached by browsers indefinitely and
   * cannot be withdrawn once issued — and this is the first time the namespace
   * has ever served traffic. REQ-CUT-003's 301 is a different redirect: old
   * ORIGIN to new origin, configured in Vercel at cutover, not here.
   *
   * `www` is listed separately because a `has` host match is exact.
   */
  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "host", value: "hrajsport.cz" }],
        destination: "/football",
        permanent: false,
      },
      {
        source: "/",
        has: [{ type: "host", value: "www.hrajsport.cz" }],
        destination: "/football",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
