import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold.ts";
import { apiClientFor, players, signInAs } from "./helpers/session.ts";

/**
 * THE STAGE 6 STRIPS — payment choice, claim confirmation, the cancel dialog
 * and the three waitlist states.
 *
 * `docs/v13/strips/stage6/`, 390px, EN and CS.
 *
 * EACH STATE IS BUILT RATHER THAN SAMPLED, because every one of them is a
 * moment rather than a page: a full game with somebody waiting, a wallet with
 * nothing in it, a booking that exists only so it can be cancelled. A strip
 * taken off the seeded board would catch whichever of these happened to be
 * true and silently miss the rest.
 */

const OUT = path.resolve(process.cwd(), "docs/v13/strips/stage6");

test.describe("Stage 6 strips", () => {
  test.use({ viewport: { width: 390, height: 900 } });

  for (const locale of ["en", "cs"] as const) {
    test(`the booking and waitlist surfaces — ${locale}`, async ({ page, context }) => {
      mkdirSync(OUT, { recursive: true });
      await context.addCookies([
        { name: LOCALE_COOKIE, value: locale, domain: "localhost", path: "/" },
      ]);

      const settle = async () => {
        await page.evaluate(() => document.fonts.ready);
        await page.addStyleTag({
          content:
            "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
        });
      };

      const open = await createScratchGame({ hoursFromNow: 24 * 4, capacity: 12 });
      const full = await createScratchGame({ hoursFromNow: 24 * 5, capacity: 2 });

      try {
        await signInAs(context, players.runner);

        // --- 1. payment choice --------------------------------------------
        await page.goto(`/game/${open.id}/book`, { waitUntil: "networkidle" });
        await settle();
        await expect(page.getByTestId("confirm-booking")).toBeVisible();
        await page.screenshot({ path: path.join(OUT, `01-payment-choice-${locale}.png`) });

        // --- 2. claim confirmation, with the insufficient-credits offer ----
        // The strip above captures the UNCHOSEN state, which is the one round 7
        // item 10 introduced — so the selection happens after the screenshot.
        //
        // ONLINE, not cash: round 23 item 7 removed cash, and this player has
        // no credit, so online is the only option there is. The redirect it
        // performs is why the confirmation is reached through the booking id
        // below rather than by waiting for a URL.
        await page.getByTestId("pay-online-input").check();
        await page.getByTestId("confirm-booking").click();
        await page.waitForURL(/\/book\/confirmation/);
        await settle();
        await expect(page.getByTestId("confirmation")).toBeVisible();
        await page.screenshot({
          path: path.join(OUT, `02-confirmation-${locale}.png`),
          fullPage: true,
        });

        // --- 3. the cancel dialog, open ------------------------------------
        await page.goto(`/game/${open.id}`, { waitUntil: "networkidle" });
        await settle();
        await page.getByTestId("cancel-booking").click();
        await expect(page.getByTestId("cancel-dialog")).toBeVisible();
        await page.screenshot({ path: path.join(OUT, `03-cancel-dialog-${locale}.png`) });
        await page.getByTestId("cancel-dialog-keep").click();

        // --- 4. the waitlist, joined (the claim bar's state) ---------------
        const organizer = await apiClientFor(players.organizer);
        for (const player of [players.organizer, players.seedBot] as const) {
          await organizer.rpc("admin_create_booking", {
            p_game_id: full.id,
            p_player_id: player.id,
            p_payment_method: "cash",
          });
        }

        await page.goto(`/game/${full.id}`, { waitUntil: "networkidle" });
        await settle();
        await page.getByTestId("join-waitlist").click();
        await expect(page.getByTestId("claim-bar")).toHaveAttribute(
          "data-state",
          "waitlisted",
        );
        await settle();
        await page.screenshot({ path: path.join(OUT, `04-waitlist-joined-${locale}.png`) });

        // --- 5. the spot-opened state --------------------------------------
        await page.goto(`/game/${full.id}/waitlist/convert`, { waitUntil: "networkidle" });
        await settle();
        await expect(page.getByTestId("waitlist-status")).toHaveAttribute(
          "data-tone",
          "open",
        );
        await page.screenshot({
          path: path.join(OUT, `05-waitlist-spot-open-${locale}.png`),
          fullPage: true,
        });

        // --- 6. not on the list --------------------------------------------
        await context.clearCookies();
        await signInAs(context, players.creditRich);
        await page.goto(`/game/${full.id}/waitlist/convert`, { waitUntil: "networkidle" });
        await settle();
        await expect(page.getByTestId("waitlist-status")).toHaveAttribute(
          "data-tone",
          "absent",
        );
        await page.screenshot({
          path: path.join(OUT, `06-waitlist-not-on-list-${locale}.png`),
        });
      } finally {
        await destroyScratchGame(open.id);
        await destroyScratchGame(full.id);
      }
    });
  }
});
