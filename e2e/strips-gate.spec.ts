import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold.ts";
import { apiClientFor, players } from "./helpers/session.ts";
import { pragueDayKey } from "../lib/games/days.ts";

/**
 * THE STRIP GATE — the tab row and one card, close up, before propagation.
 *
 * `docs/v13/strips/gate/`. Two subjects only, at the size a reviewer can
 * actually judge them: the calendar row (All + seven days, resting and with a
 * day selected) and a single card carrying the final anatomy.
 *
 * A GAME IS BUILT FOR THE CARD rather than sampling the board, because the
 * anatomy has to show all six lines at once — a venue with a surface, a
 * format, a part-filled bar and a lineup. The seeded games each miss one.
 */

const OUT = path.resolve(process.cwd(), "docs/v13/strips/gate");

test.describe("Gate strips", () => {
  test.use({ viewport: { width: 390, height: 900 } });

  test("tab row and one card — en + cs", async ({ page, context }) => {
    mkdirSync(OUT, { recursive: true });

    const game = await createScratchGame({
      hoursFromNow: 24 * 3,
      capacity: 12,
      format: "6v6",
      surface: "turf",
    });

    try {
      // Two bookings: the bar is part-filled and the lineup has faces.
      const organizer = await apiClientFor(players.organizer);
      for (const player of [players.runner, players.creditPartial] as const) {
        await organizer.rpc("admin_create_booking", {
          p_game_id: game.id,
          p_player_id: player.id,
          p_payment_method: "cash",
        });
      }

      const day = pragueDayKey(game.startsAt);

      for (const locale of ["en", "cs"] as const) {
        await context.addCookies([
          { name: LOCALE_COOKIE, value: locale, domain: "localhost", path: "/" },
        ]);

        const settle = async () => {
          await page.evaluate(() => document.fonts.ready);
          await page.addStyleTag({
            content:
              "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
          });
          /*
            Hide the fixed chrome. An ELEMENT screenshot still composites
            whatever is painted over that element, so the nav pill sat across
            the bottom of the card in the first capture — the same class of
            artefact as a `fullPage` shot stamping a fixed layer mid-image.
          */
          await page.addStyleTag({
            content:
              '[data-testid="nav-pill"],[data-testid="site-header"]{visibility:hidden !important}',
          });
        };

        // --- the row at rest: All selected, seven days ---------------------
        await page.goto("/games", { waitUntil: "networkidle" });
        await settle();
        await expect(page.getByTestId("day-tab")).toHaveCount(7);
        await expect(page.getByTestId("day-tab-all")).toHaveAttribute(
          "data-selected",
          "true",
        );
        await page.getByTestId("day-picker").screenshot({
          path: path.join(OUT, `tabs-all-${locale}.png`),
        });

        // --- the card, with every line of the anatomy present ---------------
        const card = page.locator(`[data-testid="game-row"][href="/game/${game.id}"]`);
        await expect(card.getByTestId("card-venue")).toBeVisible();
        await expect(card.getByTestId("card-when")).toBeVisible();
        await expect(card.getByTestId("card-format")).toBeVisible();
        await expect(card.getByTestId("capacity-segments")).toBeVisible();
        await expect(card.getByTestId("row-spots")).toBeVisible();
        await expect(card.getByTestId("avatar").first()).toBeVisible();
        await card.scrollIntoViewIfNeeded();
        await card.screenshot({ path: path.join(OUT, `card-${locale}.png`) });

        // --- the row with a day selected -----------------------------------
        await page.goto(`/games?day=${day}`, { waitUntil: "networkidle" });
        await settle();
        await expect(
          page.locator(`[data-testid="day-tab"][data-day="${day}"]`),
        ).toHaveAttribute("data-selected", "true");
        await page.getByTestId("day-picker").screenshot({
          path: path.join(OUT, `tabs-day-${locale}.png`),
        });
      }
    } finally {
      await destroyScratchGame(game.id);
    }
  });
});
