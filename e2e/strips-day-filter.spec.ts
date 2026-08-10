import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
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
 * the ruling that brought this control back was caused by a game published for
 * late August being unreachable behind an eight-day window. A strip taken on
 * the seeded board alone would show a week of tabs and prove nothing about the
 * guarantee — so one game is deliberately placed weeks out, and it must be
 * visible in the `All` view without scrolling any strip.
 */

const OUT = path.resolve(process.cwd(), "docs/v13/strips/day-filter");

test.describe("Day filter strips", () => {
  test.use({ viewport: { width: 390, height: 900 } });

  test("All and a selected day, with a far-future game — en + cs", async ({
    page,
    context,
  }) => {
    mkdirSync(OUT, { recursive: true });

    // Weeks out: outside any fixed window the removed strip could have drawn.
    const distant = await createScratchGame({ hoursFromNow: 24 * 26 });
    const soon = await createScratchGame({ hoursFromNow: 24 * 2 });

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

        // --- All: the default, and the far-future game is in it ------------
        await page.goto("/games", { waitUntil: "networkidle" });
        await settle();
        await expect(page.getByTestId("day-tab-all")).toHaveAttribute(
          "data-selected",
          "true",
        );
        // THE GUARANTEE, asserted in the strip that claims it.
        await expect(
          page.locator(`[data-testid="game-row"][href="/game/${distant.id}"]`),
          `${locale}: the far-future game must be in All`,
        ).toBeVisible();
        await page.screenshot({
          path: path.join(OUT, `all-390-${locale}.png`),
          fullPage: true,
        });

        /*
          --- one day selected ---------------------------------------------

          A day INSIDE the week, because amendment A fixed the row at seven
          cells: the far-future game has no cell, and `resolveSelectedDay`
          correctly refuses a `?day=` it cannot offer, falling back to `All`.
          That is the design — the week is a convenience, `All` is the route —
          so the selected-day strip uses the day the near game is on.
        */
        const soonDay = pragueDayKey(soon.startsAt);
        await page.goto(`/games?day=${soonDay}`, { waitUntil: "networkidle" });
        await settle();
        await expect(
          page.locator(`[data-testid="day-tab"][data-day="${soonDay}"]`),
        ).toHaveAttribute("data-selected", "true");
        await expect(
          page.locator(`[data-testid="game-row"][href="/game/${distant.id}"]`),
        ).toHaveCount(0);
        await page.screenshot({
          path: path.join(OUT, `day-390-${locale}.png`),
          fullPage: true,
        });
      }
    } finally {
      await destroyScratchGame(distant.id);
      await destroyScratchGame(soon.id);
    }
  });
});
