import { expect, test, type BrowserContext } from "@playwright/test";
import { createHmac } from "node:crypto";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { PENDING_PURCHASE_COOKIE } from "../lib/payments/pendingPurchase";
import { apiClientFor, players, signInAs, signOut } from "./helpers/session";
import {
  clearActiveBookings,
  createScratchGame,
  destroyScratchGame,
  resetWallet,
} from "./helpers/scaffold";

/**
 * ROUND 15 ITEM 1 — the Stripe return page, driven end to end.
 *
 * THE RACE THIS PAGE EXISTS FOR IS THE THING UNDER TEST. Coming back from
 * Stripe is a redirect in the player's BROWSER; the confirmation is a webhook
 * to our SERVER. They are two journeys and they finish in either order. So
 * every test here lands the browser first and delivers the webhook second —
 * the order that used to leave a player staring at "spot held, unpaid" on a
 * booking they had just paid for.
 *
 * THE WEBHOOK IS THE REAL ONE, signed, over HTTP. Flipping the row with a
 * service client would prove that the page reacts to a change; it would not
 * prove that the change a real payment produces is the change the page reacts
 * to. It also cannot: `service_role` holds no UPDATE on `bookings`, and the
 * write would report success and do nothing.
 */

test.use({ viewport: { width: 390, height: 844 } });

const PRICE = 150;
const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

function signedEvent(sessionId: string, reference: string, amountMinor: number) {
  const payload = JSON.stringify({
    id: "evt_" + sessionId,
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        client_reference_id: reference,
        amount_total: amountMinor,
        currency: "czk",
      },
    },
  });
  const at = Math.floor(Date.now() / 1000);
  const mac = createHmac("sha256", SECRET).update(`${at}.${payload}`, "utf8").digest("hex");
  return { payload, header: `t=${at},v1=${mac}` };
}

/**
 * The stash, written by hand.
 *
 * THE SERVER ACTION WRITES IT IN PRODUCTION, and that half is pinned in
 * `lib/payments/__tests__/pendingPurchaseCookie.test.ts` — including
 * `sameSite: "lax"`, which is the attribute whose loss would be invisible
 * here. Reaching it through the UI instead would need a configured Payment
 * Link and a redirect off-site, which tests Stripe's hosting rather than this
 * page. So the browser is placed where the redirect would have left it.
 */
async function stash(context: BrowserContext, kind: "booking" | "pass", id: string) {
  await context.addCookies([
    {
      name: PENDING_PURCHASE_COOKIE,
      value: `${kind}:${id}`,
      domain: "localhost",
      path: "/",
    },
  ]);
}

async function inEnglish(context: BrowserContext) {
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);
}

test.describe("the Stripe return page", () => {
  test.skip(!SECRET, "STRIPE_WEBHOOK_SECRET is not set for the test run");

  test("waits, then lands on the booking confirmation when the webhook arrives", async ({
    page,
    context,
    request,
  }) => {
    const game = await createScratchGame({ capacity: 6, priceCzk: PRICE });
    try {
      await clearActiveBookings("runner");
      await signInAs(context, players.runner);
      await inEnglish(context);

      /*
       * Booked as the player through the RPC: `create_booking` takes identity
       * from `auth.uid()`, and the page's Online option is disabled without a
       * Payment Link configured. What is under test starts after the redirect.
       */
      const asRunner = await apiClientFor(players.runner);
      const { data } = await asRunner.rpc("create_booking", {
        p_game_id: game.id,
        p_payment_method: "qr",
        p_guest_count: 0,
        p_online: true,
      });
      const bookingId = (data as { id: string }).id;
      await stash(context, "booking", bookingId);

      // --- the browser gets back first -----------------------------------
      await page.goto("/payment/return", { waitUntil: "networkidle" });

      const waiting = page.getByTestId("payment-confirming");
      await expect(waiting).toBeVisible();
      await expect(waiting).toHaveAttribute("data-state", "waiting");

      /*
       * IT MUST NOT CLAIM ANYTHING YET. The webhook has not run; the money is
       * unconfirmed as far as this system knows, and the one unforgivable
       * thing this screen could do is say "confirmed" on the strength of a
       * redirect anybody can type into an address bar.
       */
      const early = (await page.locator("body").innerText()).toLowerCase();
      expect(early, "the wait claims the booking is confirmed").not.toContain("confirmed");

      // --- and now the webhook, late, as it is in life --------------------
      const { payload, header } = signedEvent("cs_r15_book", bookingId, PRICE * 100);
      const res = await request.post("/api/stripe/webhook", {
        headers: { "stripe-signature": header, "content-type": "application/json" },
        data: payload,
      });
      expect(res.status()).toBe(200);
      expect((await res.json()).outcome).toBe("confirmed");

      // --- the page notices, on its own, and goes -------------------------
      await page.waitForURL(
        new RegExp(`/game/${game.id}/book/confirmation\\?booking=${bookingId}`),
        { timeout: 15_000 },
      );
      await expect(page.getByTestId("booking-confirmed")).toBeVisible();

      // THE EXISTING PAGE, not a copy of it: the calendar link is the tell.
      await expect(page.getByTestId("ics-link")).toBeVisible();

      /*
       * AND THE STASH IS GONE. The poll clears it on a terminal state, so a
       * later visit to `/payment/return` cannot re-run a settled payment's
       * wait.
       */
      const left = (await context.cookies()).find(
        (c) => c.name === PENDING_PURCHASE_COOKIE,
      );
      expect(left?.value ?? "", "the stash outlived the payment").toBe("");
    } finally {
      await clearActiveBookings("runner");
      await destroyScratchGame(game.id);
    }
  });

  test("lands on the credits page when the purchase was a pass", async ({
    page,
    context,
    request,
  }) => {
    await resetWallet(players.creditPartial.id);
    try {
      await signInAs(context, players.creditPartial);
      await inEnglish(context);

      const asPlayer = await apiClientFor(players.creditPartial);
      const { data, error } = await asPlayer.rpc("begin_pass_purchase", {
        p_pass_games: 5,
      });
      expect(error, error?.message).toBeNull();
      const topup = data as { id: string; amount_czk: number };
      await stash(context, "pass", topup.id);

      await page.goto("/payment/return", { waitUntil: "networkidle" });
      await expect(page.getByTestId("payment-confirming")).toBeVisible();

      const { payload, header } = signedEvent(
        "cs_r15_pass",
        topup.id,
        topup.amount_czk * 100,
      );
      const res = await request.post("/api/stripe/webhook", {
        headers: { "stripe-signature": header, "content-type": "application/json" },
        data: payload,
      });
      expect(res.status()).toBe(200);

      await page.waitForURL(/\/pass\/credits-added/, { timeout: 15_000 });

      /*
       * THE COUNT IS THE WALLET, NOT THE PURCHASE. The wallet was reset and
       * five games were bought, so five is both — which is the point: if this
       * page ever renders the tier instead of the balance, the assertion that
       * catches it is a player who already had credit. That case is covered
       * in the standalone test below.
       */
      const panel = page.getByTestId("credits-added");
      await expect(panel).toBeVisible();
      await expect(panel).toHaveAttribute("data-credits", "5");
      await expect(page.getByTestId("credits-added-count")).toContainText("5 credits");
    } finally {
      await resetWallet(players.creditPartial.id);
    }
  });

  /*
   * THE RECOVERY LOOKUP — a return with no stash at all.
   *
   * This is the different-device case, and it is not exotic: paying on a
   * phone with a banking app that opens its own browser is exactly it. There
   * is no cookie of ours in that jar, and the only thing left to go on is
   * "this signed-in player started a payment a moment ago".
   */
  test("finds the purchase with no stash, on the signed-in player alone", async ({
    page,
    context,
  }) => {
    const game = await createScratchGame({ capacity: 6, priceCzk: PRICE });
    try {
      await clearActiveBookings("runner");
      await signInAs(context, players.runner);
      await inEnglish(context);

      const asRunner = await apiClientFor(players.runner);
      const { data } = await asRunner.rpc("create_booking", {
        p_game_id: game.id,
        p_payment_method: "qr",
        p_guest_count: 0,
        p_online: true,
      });
      expect(data).toBeTruthy();

      // NO `stash()` CALL. That absence is the test.
      await page.goto("/payment/return", { waitUntil: "networkidle" });

      await expect(page.getByTestId("payment-confirming")).toBeVisible();
      await expect(page.getByTestId("payment-return-unknown")).toHaveCount(0);
    } finally {
      await clearActiveBookings("runner");
      await destroyScratchGame(game.id);
    }
  });
});

/*
 * The rest need no webhook secret: they are about what the page does with no
 * payment, no session, and too much time.
 */

test("a signed-out return signs in and comes back here", async ({ page, context }) => {
  await signOut(context);
  await page.goto("/payment/return");

  await page.waitForURL(/\/login/);
  const next = new URL(page.url()).searchParams.get("next");
  expect(next, "signing in would not return to the payment").toBe("/payment/return");
});

test("a return with nothing to confirm says so, and points onward", async ({
  page,
  context,
}) => {
  await clearActiveBookings("runner");
  await signInAs(context, players.runner);
  await inEnglish(context);

  await page.goto("/payment/return", { waitUntil: "networkidle" });

  await expect(page.getByTestId("payment-return-unknown")).toBeVisible();
  await expect(page.getByTestId("payment-confirming")).toHaveCount(0);

  // It must not read as a failure — there is no failed payment here.
  const body = (await page.locator("body").innerText()).toLowerCase();
  expect(body).not.toContain("failed");
  expect(body).not.toContain("error");

  await page.getByTestId("payment-return-profile").click();
  await page.waitForURL(/\/account/);
});

/**
 * THE SLOW STATE, reached by moving the clock rather than by waiting a minute.
 *
 * A spec that really sits for sixty seconds is a spec people delete. The fake
 * clock drives the component's own timer chain, which is the thing under
 * test — the threshold is read from `Date.now()` inside the poll loop, so
 * fast-forwarding is indistinguishable from patience.
 */
test("after a minute it stops implying it is imminent, and says what is true", async ({
  page,
  context,
}) => {
  const game = await createScratchGame({ capacity: 6, priceCzk: PRICE });
  try {
    await clearActiveBookings("runner");
    await signInAs(context, players.runner);
    await inEnglish(context);

    const asRunner = await apiClientFor(players.runner);
    const { data } = await asRunner.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "qr",
      p_guest_count: 0,
      p_online: true,
    });
    await stash(context, "booking", (data as { id: string }).id);

    await page.clock.install();
    await page.goto("/payment/return", { waitUntil: "networkidle" });

    const panel = page.getByTestId("payment-confirming");
    await expect(panel).toHaveAttribute("data-state", "waiting");

    await page.clock.fastForward(65_000);

    await expect(panel).toHaveAttribute("data-state", "slow");

    // NEVER "failed", and never "confirmed". The money is with Stripe and the
    // only honest sentence is that we have not been told yet.
    const body = (await panel.innerText()).toLowerCase();
    expect(body).toContain("do not need to pay again");
    expect(body).not.toContain("failed");

    // And a way out, which did not exist while the wait was still short.
    await expect(page.getByTestId("payment-slow-link")).toBeVisible();
    await page.getByTestId("payment-slow-link").click();
    await page.waitForURL(new RegExp(`/game/${game.id}`));
  } finally {
    await clearActiveBookings("runner");
    await destroyScratchGame(game.id);
  }
});
