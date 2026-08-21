import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { PENDING_PURCHASE_COOKIE } from "../lib/payments/pendingPurchase";
import { apiClientFor, players, signInAs } from "./helpers/session";
import {
  clearActiveBookings,
  createScratchGame,
  destroyScratchGame,
  resetWallet,
  setWalletTo,
} from "./helpers/scaffold";

/**
 * ROUND 15 — the two new surfaces, photographed in all three languages.
 *
 * `docs/v15/strips/`. The wait is captured in BOTH of its states, because the
 * second one only appears after a minute and is therefore the one nobody ever
 * looks at — which is exactly why its wording matters.
 */

const OUT = path.resolve(process.cwd(), "docs/v15/strips");
const CREDIT_CZK = 150;

test.use({ viewport: { width: 390, height: 844 } });

async function settle(page: import("@playwright/test").Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content:
      "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
  });
}

test("the wait and the credits page, in three languages", async ({ page, context }) => {
  mkdirSync(OUT, { recursive: true });
  const game = await createScratchGame({ capacity: 6, priceCzk: CREDIT_CZK });

  try {
    await clearActiveBookings("runner");
    await signInAs(context, players.runner);

    const asRunner = await apiClientFor(players.runner);
    const { data } = await asRunner.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "qr",
      p_guest_count: 0,
      p_online: true,
    });
    const bookingId = (data as { id: string }).id;

    for (const locale of ["en", "cs", "ru"] as const) {
      await context.addCookies([
        { name: LOCALE_COOKIE, value: locale, domain: "localhost", path: "/" },
        {
          name: PENDING_PURCHASE_COOKIE,
          value: `booking:${bookingId}`,
          domain: "localhost",
          path: "/",
        },
      ]);

      // The short wait — what almost every player sees, for two seconds.
      await page.clock.install();
      await page.goto("/payment/return", { waitUntil: "networkidle" });
      await settle(page);
      await page.screenshot({ path: path.join(OUT, `01-confirming-${locale}.png`) });

      // The long one. Reached with the clock rather than with patience.
      await page.clock.fastForward(65_000);
      await page.getByTestId("payment-slow-link").waitFor();
      await settle(page);
      await page.screenshot({ path: path.join(OUT, `02-slow-${locale}.png`) });
    }
  } finally {
    await clearActiveBookings("runner");
    await destroyScratchGame(game.id);
  }

  // --- the credits page ----------------------------------------------------
  try {
    await signInAs(context, players.creditPartial);
    await setWalletTo(players.creditPartial.id, 5 * CREDIT_CZK);

    for (const locale of ["en", "cs", "ru"] as const) {
      await context.addCookies([
        { name: LOCALE_COOKIE, value: locale, domain: "localhost", path: "/" },
      ]);
      await page.goto("/pass/credits-added", { waitUntil: "networkidle" });
      await settle(page);
      await page.screenshot({ path: path.join(OUT, `03-credits-added-${locale}.png`) });
    }
  } finally {
    await resetWallet(players.creditPartial.id);
  }
});
