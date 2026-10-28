import { expect, test } from "@playwright/test";

/**
 * Owner, 2026-10-28: people browsing hrajfotbal.com "still end up on the
 * hrajfotbalek web". The old address now forwards — driven through the real
 * proxy by asking for a page under the old Host header. Locally the site
 * address is the dev server's, so that is where the forward points.
 */
const OLD_HOST = "hrajfotbalek-wlya.vercel.app";
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

test("a page on the old address forwards permanently to the same page on the new one", async ({ request }) => {
  // Act
  const response = await request.get("/games?day=2026-11-01", {
    headers: { host: OLD_HOST },
    maxRedirects: 0,
  });

  // Assert
  // Resolved, because Next writes a SAME-origin target as a bare path — and
  // locally the site address is this very server. On production the two
  // origins differ and the header carries the full https://www address.
  expect(response.status()).toBe(308);
  expect(new URL(response.headers().location!, SITE).href).toBe(`${SITE}/games?day=2026-11-01`);
});

test("the API on the old address is served, not forwarded — Stripe's webhook may live there", async ({ request }) => {
  // Act — unsigned, so refused; what matters is that it was ANSWERED here.
  const response = await request.post("/api/stripe/webhook", {
    headers: { host: OLD_HOST },
    data: "{}",
    maxRedirects: 0,
  });

  // Assert
  expect(response.status()).not.toBe(308);
  expect(response.status()).toBe(400);
});

test("the new address is served as it always was", async ({ request }) => {
  // Act
  const response = await request.get("/games", { maxRedirects: 0 });

  // Assert
  expect(response.status()).toBe(200);
});
