import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LOCALE_COOKIE } from "../lib/i18n/locales";

/**
 * SECTION 3 STRIPS — the games page and home, 390px, EN.
 *
 * `docs/v13/strips/section3/`.
 *
 * BOTH SURFACES, because item 5 changed both: the pills lost their date and
 * home gained the day-heading structure that now carries it. A strip of the
 * games page alone would leave the half of the ruling that reaches home
 * unshown.
 */

const OUT = path.resolve(process.cwd(), "docs/v13/strips/section3");

test.describe("Section 3 strips", () => {
  test.use({ viewport: { width: 390, height: 900 } });

  test("games page and home — en", async ({ page, context }) => {
    mkdirSync(OUT, { recursive: true });
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);

    const settle = async () => {
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({
        content:
          "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
      });
    };

    // --- the games page -----------------------------------------------------
    await page.goto("/games", { waitUntil: "networkidle" });
    await settle();

    // The rulings, asserted in the strip that claims them.
    const cells = page.getByTestId("day-tab");
    await expect(cells).toHaveCount(8);
    await expect(cells.nth(0)).toContainText("Today");
    await expect(cells.nth(1)).toContainText("Tomorrow");
    await expect(page.getByTestId("card-when").first()).toHaveText(/^\d{2}:\d{2}$/);

    // The calendar row and the pass panel, close up — items 1 and 2.
    await page.getByTestId("day-picker").screenshot({
      path: path.join(OUT, "01-calendar-row.png"),
    });
    await page.getByTestId("pass-panel").screenshot({
      path: path.join(OUT, "02-pass-panel.png"),
    });

    await page.addStyleTag({
      content:
        '[data-testid="nav-pill"],[data-testid="site-header"]{visibility:hidden !important}',
    });
    await page.screenshot({ path: path.join(OUT, "03-games-page.png"), fullPage: true });

    // --- home ---------------------------------------------------------------
    await page.goto("/", { waitUntil: "networkidle" });
    await settle();
    await expect(page.getByTestId("next-matches").getByTestId("day-heading").first()).toBeVisible();
    await page.addStyleTag({
      content:
        '[data-testid="nav-pill"],[data-testid="site-header"]{visibility:hidden !important}',
    });
    await page.screenshot({ path: path.join(OUT, "04-home.png"), fullPage: true });
  });
});
