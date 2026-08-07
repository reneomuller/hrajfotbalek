import type { NextConfig } from "next";

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
