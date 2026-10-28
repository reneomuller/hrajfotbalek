import { describe, expect, it } from "vitest";
import { LEGACY_HOSTS, legacyHostRedirect } from "@/lib/legacyHost";

/**
 * Owner, 2026-10-28: "when navigating the hrajfotbal.com site, some people
 * still end up on the hrajfotbalek web instead on some pages." The old address
 * stays — "just in case i missed updating the adress somewhere" — but as a
 * forward to the new one, not a second copy of the site.
 */
const SITE = "https://www.hrajfotbal.com";

describe("legacyHostRedirect", () => {
  it("forwards every old production address to the same page on the new one", () => {
    // Act
    const targets = LEGACY_HOSTS.map((host) => legacyHostRedirect(host, "/game/3", "", SITE));

    // Assert
    expect(targets).toEqual(LEGACY_HOSTS.map(() => `${SITE}/game/3`));
  });

  it("keeps the query string, so a sign-in link survives the forward", () => {
    // Act
    const target = legacyHostRedirect(
      "hrajfotbalek-wlya.vercel.app",
      "/auth/callback",
      "?token_hash=abc&type=signup",
      SITE,
    );

    // Assert
    expect(target).toBe(`${SITE}/auth/callback?token_hash=abc&type=signup`);
  });

  it("leaves the API alone — Stripe does not follow a redirect to a webhook", () => {
    // Act
    const target = legacyHostRedirect("hrajfotbalek-wlya.vercel.app", "/api/stripe/webhook", "", SITE);

    // Assert
    expect(target).toBeNull();
  });

  it("ignores the host's case and port", () => {
    // Act
    const target = legacyHostRedirect("HrajFotbalek-WLYA.vercel.app:443", "/", "", SITE);

    // Assert
    expect(target).toBe(`${SITE}/`);
  });

  it("does nothing on the new address, on a preview, or with no site address configured", () => {
    // Act
    const targets = [
      legacyHostRedirect("www.hrajfotbal.com", "/games", "", SITE),
      legacyHostRedirect("hrajfotbalek-wlya-h1qgeve5w-reneomuller-7550s-projects.vercel.app", "/games", "", SITE),
      legacyHostRedirect("localhost:3000", "/games", "", SITE),
      legacyHostRedirect("hrajfotbalek-wlya.vercel.app", "/games", "", undefined),
    ];

    // Assert
    expect(targets).toEqual([null, null, null, null]);
  });
});
