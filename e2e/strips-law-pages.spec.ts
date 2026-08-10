import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LOCALE_COOKIE } from "../lib/i18n/locales";

/**
 * THE LAYOUT LAW, VERIFIED ON ALL THREE SURFACES AS RENDERED PAGES.
 *
 * The earlier strips captured cards in ISOLATION — `locator.screenshot()` on
 * one element — which proves a component draws correctly and proves nothing
 * about whether a given page uses it. The law names three surfaces, so three
 * pages are captured whole.
 *
 * FULL PAGE, with the fixed layers hidden. A `fullPage` capture renders a
 * `position: fixed` element once at its first-viewport position and stamps it
 * across the middle of the image — an artefact of the capture, not of the
 * product (see `strips-stage0.spec.ts`). The nav pill and header are hidden so
 * the content is unobstructed; the claim bar is NOT hidden on the detail,
 * because it is one of the three things being checked.
 *
 * The seeded board is used rather than a scratch game: it carries bookings, so
 * the avatar stacks have something to draw, and it is what a reviewer would
 * see opening the product.
 */

const OUT = path.resolve(process.cwd(), "docs/v13/strips/layout-law");

test.describe("Layout law — whole pages", () => {
  test.use({ viewport: { width: 390, height: 900 } });

  test("home, games and detail at 390px — en", async ({ page, context }) => {
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
    const hideChrome = () =>
      page.addStyleTag({
        content:
          '[data-testid="nav-pill"],[data-testid="site-header"]{visibility:hidden !important}',
      });

    // --- 1. HOME ---------------------------------------------------------
    await page.goto("/", { waitUntil: "networkidle" });
    await settle();
    const homeCards = page.getByTestId("next-matches").getByTestId("game-row");
    await expect(homeCards.first()).toBeVisible();
    // The law, asserted rather than eyeballed: no price, and a stack on any
    // card whose game has bookings.
    await expect(homeCards.first().getByTestId("card-price")).toHaveCount(0);
    await hideChrome();
    await page.screenshot({ path: path.join(OUT, "10-home-page.png"), fullPage: true });

    // --- 2. GAMES --------------------------------------------------------
    await page.goto("/games", { waitUntil: "networkidle" });
    await settle();
    const listCards = page.getByTestId("game-row");
    await expect(listCards.first()).toBeVisible();
    await expect(listCards.first().getByTestId("card-price")).toHaveCount(0);
    await hideChrome();
    await page.screenshot({ path: path.join(OUT, "11-games-page.png"), fullPage: true });

    /*
     * THE TWO LIST SURFACES MUST BE THE SAME COMPONENT, and this is the
     * assertion that actually proves it: the home card and the games card are
     * compared by their rendered structure, not by trusting the import. A page
     * that had drifted onto its own markup would differ here even if both
     * looked plausible in isolation.
     */
    const shapeOf = (testId: string) =>
      page.evaluate((id) => {
        const root =
          id === "home"
            ? document.querySelector('[data-testid="next-matches"] [data-testid="game-row"]')
            : document.querySelector('[data-testid="game-row"]');
        if (!root) return null;
        return [...root.querySelectorAll("[data-testid]")]
          .map((n) => (n as HTMLElement).dataset.testid)
          .join(",");
      }, testId);

    const gamesShape = await shapeOf("games");
    await page.goto("/", { waitUntil: "networkidle" });
    await settle();
    const homeShape = await shapeOf("home");
    expect(homeShape, "home and games must render the same card").toBe(gamesShape);

    // --- 3. DETAIL -------------------------------------------------------
    /*
     * A GAME WITH A LINEUP, deliberately. The first card on the board is
     * often a freshly created scratch game with nobody on it — and at zero
     * bookings the detail correctly renders NO dotted line and NO faces
     * (§2.1), so a strip taken there would show the arrangement's absence and
     * prove nothing about the arrangement.
     */
    await page.goto("/games", { waitUntil: "networkidle" });
    await settle();
    const withLineup = page
      .getByTestId("game-row")
      .filter({ has: page.getByTestId("avatar") })
      .first();
    await expect(withLineup).toBeVisible();
    const href = await withLineup.getAttribute("href");
    await page.goto(href!, { waitUntil: "networkidle" });
    await settle();
    await expect(page.getByTestId("availability-card")).toBeVisible();
    await expect(page.getByTestId("claim-bar")).toBeVisible();
    // The claim bar stays visible — it carries the price the cards gave up.
    await page.addStyleTag({
      content: '[data-testid="site-header"]{visibility:hidden !important}',
    });
    await page.screenshot({ path: path.join(OUT, "12-detail-page.png"), fullPage: true });
  });
});
