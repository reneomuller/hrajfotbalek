import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STABLE_READ_TTL_SECONDS, STABLE_TAGS } from "@/lib/db/stableRead";

/**
 * ROUND 37, ITEM 2 — THE CACHE MAY NOT HIDE AN APPLIED MIGRATION.
 *
 * The owner's constraint, in his words: an applied migration's feature must
 * still show up promptly, never sit behind a stale cache. That is not a comment
 * to be trusted, it is a property — and it is exactly the kind of property that
 * decays silently, because raising a TTL is a one-character edit that nothing
 * else objects to and whose cost only appears the next time somebody applies a
 * migration and waits.
 *
 * So the ceiling is asserted, the bust key is asserted, and the absence of a
 * negative-result shortcut is asserted. All three read the SOURCE rather than
 * the behaviour: a cache's timing cannot be observed in a unit test without
 * waiting out its own TTL, which is the one thing a test must not do.
 */

const SOURCE = readFileSync("lib/db/stableRead.ts", "utf8");

describe("the stable-read cache", () => {
  it("expires within a minute, which bounds the apply-then-appear wait", () => {
    /*
     * THE NUMBER IS THE WHOLE ARGUMENT. Sixty seconds is the worst case between
     * the owner applying a migration and the feature lighting up. Anything
     * longer turns a ritual he performs by hand into "it didn't work", which is
     * the failure this file exists to prevent.
     */
    expect(STABLE_READ_TTL_SECONDS).toBeLessThanOrEqual(60);
    expect(STABLE_READ_TTL_SECONDS).toBeGreaterThan(0);
  });

  it("keys on the BUILD, so a deploy can never serve the last one's answers", () => {
    expect(SOURCE).toContain("VERCEL_DEPLOYMENT_ID");
    expect(SOURCE, "the build id is not part of the cache key").toMatch(
      /keyParts,\s*BUILD_ID/,
    );
  });

  it("caches a FALSE no longer than a TRUE — no negative-result shortcut", () => {
    /*
     * The trap this rules out: "the migration is missing, so remember that for
     * longer / forever / until restart". A capability flag's false is the most
     * tempting value to cache hard and the most expensive one to be wrong
     * about, because it is the state the owner is actively trying to leave.
     *
     * Asserted as an ABSENCE, since the correct implementation is the one that
     * says nothing about the value at all: one revalidate, one path.
     */
    const windows = SOURCE.match(/revalidate:\s*[^,\n]+/g) ?? [];
    expect(windows, "more than one revalidate window").toHaveLength(1);
    expect(windows[0]).toContain("STABLE_READ_TTL_SECONDS");
    expect(SOURCE, "an unbounded window exists").not.toContain("Infinity");
    expect(SOURCE, "false is treated differently from any other answer").not.toMatch(
      /if\s*\(\s*!?\w+\s*\)\s*return[^;]*revalidate/,
    );
  });

  it("offers a tag per cached value, so a writer can expire its own", () => {
    // A TTL is the backstop; a tag is the mechanism. Every value cached here
    // must be expirable by whatever surface changes it.
    expect(Object.keys(STABLE_TAGS).sort()).toEqual(["capabilities", "policy", "siteSettings"]);
    for (const tag of Object.values(STABLE_TAGS)) expect(tag).toMatch(/^stable:/);
  });

  it("is used by the three reads that were on every navigation, and no others", () => {
    /*
     * MEASURED BEFORE IT WAS BUILT: `app_capabilities`, `site_settings` and
     * `cancellation_refund_cutoff_hours` fired once per navigation on all five
     * journeys. Nothing PER-PLAYER may join them — the bell's `my_notifications`
     * is the one that would be tempting and would be a data leak, since a cached
     * value here is shared by everyone who asks.
     */
    const users = [
      readFileSync("lib/db/capabilities.ts", "utf8"),
      readFileSync("lib/home/queries.ts", "utf8"),
      readFileSync("lib/policy/refundCutoff.ts", "utf8"),
    ];
    for (const src of users) expect(src).toContain("stableRead(");
    expect(
      readFileSync("lib/notifications/queries.ts", "utf8"),
      "a per-player read is cached across requests — that is a leak, not a speed-up",
    ).not.toContain("stableRead");
  });
});
