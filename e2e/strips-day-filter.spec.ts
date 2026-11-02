import { expect, test } from "@playwright/test";
import path from "node:path";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold.ts";
import { pragueDayKey } from "../lib/games/days.ts";

/**
 * THE RESTORED DAY FILTER — `All` plus a tab per day that has games.
 *
 * `docs/v13/strips/day-filter/`, whole pages at 390px, EN and CS.
 *
 * WHAT THE STRIPS HAVE TO SHOW, and why a far-future game is created for them:
 * ~~the ruling that brought this control back was caused by a game published
 * for late August being unreachable behind an eight-day window, so the far
 * game had to be visible in the `All` view.~~ REVERSED 2026-11-02, the owner:
 * lists show 8 days incl. today. The far game is still placed weeks out, and
 * it now proves the other side — `All` stops at the window, so the far game is
 * on neither view while the near one is on both.
 */


test.describe("Day filter strips", () => {
  test.use({ viewport: { width: 390, height: 900 } });

  test("All and a selected day, with a far-future game — en + cs", async ({
    page,
    context,
  }) => {

    // Weeks out: beyond the eight days the lists show (2026-11-02).
    const distant = await createScratchGame({ hoursFromNow: 24 * 26 });
    const soon = await createScratchGame({ hoursFromNow: 24 * 2 });
    const distantRow = page.locator(`[data-testid="game-row"][data-game-id="${distant.id}"]`);
    const soonRow = page.locator(`[data-testid="game-row"][data-game-id="${soon.id}"]`);

    try {

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
          await page.addStyleTag({
            content:
              '[data-testid="nav-pill"],[data-testid="site-header"]{visibility:hidden !important}',
          });
        };

        // --- All: the default, the near game in it, the far one not -------
        await page.goto("/games", { waitUntil: "networkidle" });
        await settle();
        await expect(page.getByTestId("day-tab-all")).toHaveAttribute(
          "data-selected",
          "true",
        );
        /*
         * ~~THE GUARANTEE: the far-future game must be in All.~~ THE WINDOW
         * (2026-11-02, the owner: lists show 8 days incl. today). The near row
         * first, so the absence is read off the real list and not a skeleton.
         */
        await expect(soonRow, `${locale}: the near game must be in All`).toBeVisible();
        await expect(
          distantRow,
          `${locale}: a game beyond the eight days must not be in All`,
        ).toHaveCount(0);

        /*
          --- one day selected ---------------------------------------------

          A day INSIDE the week, because amendment A fixed the row at eight
          cells: the far-future game has no cell, and `resolveSelectedDay`
          correctly refuses a `?day=` it cannot offer, falling back to `All`.
          ~~That is the design — the week is a convenience, `All` is the
          route.~~ Since 2026-11-02 neither reaches it; its own link does. So
          the selected-day strip uses the day the near game is on.
        */
        const soonDay = pragueDayKey(soon.startsAt);
        await page.goto(`/games?day=${soonDay}`, { waitUntil: "networkidle" });
        await settle();
        await expect(
          page.locator(`[data-testid="day-tab"][data-day="${soonDay}"]`),
        ).toHaveAttribute("data-selected", "true");
        await expect(soonRow).toBeVisible();
        await expect(distantRow).toHaveCount(0);
      }
    } finally {
      await destroyScratchGame(distant.id);
      await destroyScratchGame(soon.id);
    }
  });
});
