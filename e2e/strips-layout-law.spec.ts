import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold.ts";
import { apiClientFor, players } from "./helpers/session.ts";

/**
 * THE LAYOUT LAW STRIPS — the three surfaces it governs, side by side in
 * effect: home's list card, the games-page card, and the game detail.
 *
 * `docs/v13/strips/layout-law/`, 390px, EN, per the ruling that asked for
 * exactly that so the reading can be confirmed before Stage 6 builds on it.
 *
 * WHAT A REVIEWER IS CHECKING, in one sentence each:
 *
 *   - NO PRICE anywhere on either list card
 *   - a DOTTED player-count line on all three, with the avatars BELOW it
 *   - the price and its `/ 1 credit` suffix on the DETAIL'S CLAIM BAR
 *
 * A game with bookings is built for this, because a card with an empty roster
 * shows the count line and no avatars — which is correct (§2.1) and would make
 * a strip that could not answer the question it was taken for.
 */

const OUT = path.resolve(process.cwd(), "docs/v13/strips/layout-law");

test.describe("Layout law strips", () => {
  test.use({ viewport: { width: 390, height: 900 } });

  test("list cards and detail at 390px — en", async ({ page, context }) => {
    mkdirSync(OUT, { recursive: true });

    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);

    // Priced at the flat 150 so the claim bar shows the suffix the law names.
    const game = await createScratchGame({ hoursFromNow: 6, capacity: 12, priceCzk: 150 });

    try {
      // Two bookings, so the avatar row has something to draw.
      const organizer = await apiClientFor(players.organizer);
      for (const player of [players.runner, players.creditPartial] as const) {
        await organizer.rpc("admin_create_booking", {
          p_game_id: game.id,
          p_player_id: player.id,
          p_payment_method: "cash",
        });
      }

      const settle = async () => {
        await page.evaluate(() => document.fonts.ready);
        await page.addStyleTag({
          content:
            "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
        });
      };

      // --- 1. the games page card -----------------------------------------
      await page.goto("/games", { waitUntil: "networkidle" });
      await settle();
      const card = page.locator(`[data-testid="game-row"][href="/game/${game.id}"]`);
      await expect(card.getByTestId("row-spots")).toBeVisible();
      await expect(card.getByTestId("card-price")).toHaveCount(0);
      await card.scrollIntoViewIfNeeded();
      await card.screenshot({ path: path.join(OUT, "01-games-card.png") });

      // --- 2. the home card, which must be identical ----------------------
      await page.goto("/", { waitUntil: "networkidle" });
      await settle();
      const homeCard = page.getByTestId("next-matches").getByTestId("game-row").first();
      await expect(homeCard.getByTestId("card-price")).toHaveCount(0);
      await homeCard.scrollIntoViewIfNeeded();
      await homeCard.screenshot({ path: path.join(OUT, "02-home-card.png") });

      // --- 3. the detail: its card, and the claim bar ----------------------
      await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
      await settle();
      await expect(page.getByTestId("claim-bar")).toBeVisible();
      await page.getByTestId("availability-card").screenshot({
        path: path.join(OUT, "03-detail-card.png"),
      });
      await page.getByTestId("claim-bar").screenshot({
        path: path.join(OUT, "04-detail-claim-bar.png"),
      });

      // The fold, so the bar is seen where it actually sits.
      await page.screenshot({ path: path.join(OUT, "05-detail-fold.png") });
    } finally {
      await destroyScratchGame(game.id);
    }
  });
});
