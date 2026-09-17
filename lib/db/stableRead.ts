import { unstable_cache } from "next/cache";

/**
 * Cross-request caching for reads that are the SAME FOR EVERYONE and change
 * only when a human changes them (round 37, item 2).
 *
 * WHAT THIS IS FOR. Measured on the local stack, every navigation made a
 * PostgREST round trip for `app_capabilities()`, one for `site_settings` (the
 * footer's contact details) and one for `cancellation_refund_cutoff_hours()` —
 * on all five journeys, signed in or out. React's `cache()` already collapsed
 * each to one call PER REQUEST; nothing carried an answer from one navigation
 * to the next, so a player tapping through four pages paid for twelve reads of
 * three values that had not moved in weeks.
 *
 * THE RULE THIS MUST NOT BREAK, and it is the reason for every line below:
 * **an applied migration's feature must still appear promptly.** The whole
 * capability mechanism exists so the owner can apply a migration by hand and
 * watch the controls light up; a cache that holds `false` for an hour turns
 * that ritual into "it didn't work". So:
 *
 *   1. THE TTL IS SIXTY SECONDS. Not an hour, not a day. The worst case
 *      between applying a migration and seeing the feature is one minute, and
 *      a refresh a minute later is inside anybody's patience for a thing they
 *      just did. It is deliberately the shortest TTL that still removes the
 *      read from the common path.
 *
 *   2. EVERY DEPLOY BUSTS IT. The key carries the build id, so a deploy can
 *      never serve an answer computed by the previous one. This matters most in
 *      the ordinary sequence — deploy, then apply — where the first request
 *      after the deploy is a fresh read by construction.
 *
 *   3. IT IS TAGGED, so a surface that CHANGES one of these values can expire
 *      it immediately rather than waiting out the minute. `admin/site` does
 *      exactly that for the contact details.
 *
 *   4. A FALSE IS NEVER CACHED LONGER THAN A TRUE. There is no negative-result
 *      shortcut anywhere here: the miss path and the hit path are the same
 *      path, so "the migration is not applied yet" expires exactly as fast as
 *      any other answer.
 *
 * WHY THE BUILD ID RATHER THAN A TIMESTAMP. `VERCEL_DEPLOYMENT_ID` is stable
 * for the life of a deployment and different between deployments, which is
 * precisely the bust condition. Falling back to the git SHA covers a local
 * build; falling back to a constant covers `next dev`, where the whole cache is
 * per-process anyway and a stale flag lives as long as the dev server does.
 */
const BUILD_ID =
  process.env.VERCEL_DEPLOYMENT_ID ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.NEXT_BUILD_ID ??
  "dev";

/** One minute. Named, because the number is the argument for the whole file. */
export const STABLE_READ_TTL_SECONDS = 60;

/** Tags callers can revalidate when they CHANGE one of these values. */
export const STABLE_TAGS = {
  capabilities: "stable:capabilities",
  siteSettings: "stable:site-settings",
  policy: "stable:policy",
} as const;

/**
 * Wraps a read so identical calls share one answer for at most a minute.
 *
 * `keyParts` must not contain anything request-specific — no player id, no
 * cookie, no locale. Everything cached through here is a value the database
 * returns identically to every caller, which is what makes one shared answer
 * correct rather than a leak.
 */
export function stableRead<T>(
  keyParts: readonly string[],
  tag: string,
  read: () => Promise<T>,
): () => Promise<T> {
  return unstable_cache(read, [...keyParts, BUILD_ID], {
    revalidate: STABLE_READ_TTL_SECONDS,
    tags: [tag],
  });
}
