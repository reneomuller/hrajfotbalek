import { expect, test } from "@playwright/test";
import { players, signInAs } from "./helpers/session.ts";
import { createScratchGame, destroyScratchGame, setWalletTo } from "./helpers/scaffold.ts";

/**
 * THE OUTGOING STRIPE URL (round 8, items 15 and 16).
 *
 * The unit tests cover `withStripeParams` in isolation. This covers the thing
 * they cannot: that the parameters survive the round trip through a server
 * action's `redirect()` and are actually on the URL the browser is sent to.
 *
 * IT DRIVES THE REAL FLOW, which means a real booking gets created — that is
 * the point. Item 15's contract is "create the record UNPAID, then redirect",
 * so a test that stubbed the redirect would be asserting the half that cannot
 * break.
 *
 * SKIPS ITSELF WITHOUT THE ENVIRONMENT. `NEXT_PUBLIC_STRIPE_PAYMENT_URL` is
 * unset in this suite and in production, because Stripe is not live. Run it
 * with the variable set to exercise the branch:
 *
 *   NEXT_PUBLIC_STRIPE_PAYMENT_URL=https://buy.stripe.com/test_x \
 *     npx playwright test e2e/stripe-links.spec.ts
 */

const BOOKING_URL = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_URL?.trim();

test.use({ viewport: { width: 390, height: 844 } });

test("the online option redirects to a stamped payment link", async ({ page, context }) => {
  test.skip(!BOOKING_URL, "NEXT_PUBLIC_STRIPE_PAYMENT_URL is not set");

  const game = await createScratchGame({ priceCzk: 150, hoursFromNow: 52 });
  try {
    await setWalletTo(players.runner.id, 0);
    await signInAs(context, players.runner);

    // Stripe is a third party: block the navigation at the boundary and read
    // the URL we were about to send them to.
    let outgoing: string | null = null;
    await page.route("**buy.stripe.com/**", async (route) => {
      outgoing = route.request().url();
      await route.abort();
    });

    await page.goto(`/game/${game.id}/book`, { waitUntil: "networkidle" });
    await page.getByTestId("pay-online-input").check();
    await page.getByTestId("confirm-booking").click();

    await expect.poll(() => outgoing).not.toBeNull();
    const url = new URL(outgoing!);
    expect(url.searchParams.get("client_reference_id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(url.searchParams.get("prefilled_email")).toBe(players.runner.email);
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("a pass tier with a configured link redirects to it, stamped", async ({
  page,
  context,
}) => {
  const map = process.env.NEXT_PUBLIC_STRIPE_PASS_URLS?.trim();
  test.skip(!map, "NEXT_PUBLIC_STRIPE_PASS_URLS is not set");

  await signInAs(context, players.runner);

  let outgoing: string | null = null;
  await page.route("**buy.stripe.com/**", async (route) => {
    outgoing = route.request().url();
    await route.abort();
  });

  await page.goto("/pass", { waitUntil: "networkidle" });
  await page.getByTestId("buy-pass-5").click();

  await expect.poll(() => outgoing).not.toBeNull();
  const url = new URL(outgoing!);
  expect(url.searchParams.get("client_reference_id")).toMatch(/^[0-9a-f-]{36}$/);
  expect(url.searchParams.get("prefilled_email")).toBe(players.runner.email);
});
