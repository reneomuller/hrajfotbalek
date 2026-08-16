import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LOCALE_COOKIE } from "../lib/i18n/locales";

/**
 * SECTION 2 STRIPS — the whole home page, both widths, both languages.
 *
 * `docs/v13/strips/section2/`.
 *
 * WHOLE PAGES, because Section 2 is mostly about ORDER and PROPORTION: the
 * stats merged into the community box, the FAQ and Player of the Month
 * swapped, the FAQ gone wide with its six entries in two columns. A close-up
 * of any one panel would show none of that.
 *
 * The fixed chrome is hidden for the full-page shots — a `fullPage` capture
 * stamps a `position: fixed` element across the middle of the image, which is
 * an artefact of the capture rather than of the product.
 */

const OUT = path.resolve(process.cwd(), "docs/v13/strips/section2");

const VIEWPORTS = [
  { id: "390", width: 390, height: 900 },
  { id: "desktop", width: 1280, height: 900 },
] as const;

test.describe("Section 2 strips — home", () => {
  for (const viewport of VIEWPORTS) {
    for (const locale of ["en", "cs"] as const) {
      test(`home at ${viewport.id} — ${locale}`, async ({ browser }) => {
        mkdirSync(OUT, { recursive: true });

        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
        });
        await context.addCookies([
          { name: LOCALE_COOKIE, value: locale, domain: "localhost", path: "/" },
        ]);

        const page = await context.newPage();
        await page.goto("/", { waitUntil: "networkidle" });
        await page.evaluate(() => document.fonts.ready);

        // The rulings, asserted in the strip that claims them.
        await expect(page.getByTestId("hero-vision")).toHaveCount(0);
        await expect(page.getByTestId("equipment-line")).toHaveCount(0);
        await expect(page.getByTestId("stats-panel")).toHaveCount(0);
        await expect(page.getByTestId("community-stats")).toBeVisible();

        await page.addStyleTag({
          content:
            "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
        });

        // The fold, with the chrome where it really is — this is the shot that
        // shows the one-row wordmark against the top of the page.
        await page.screenshot({ path: path.join(OUT, `${viewport.id}-${locale}-fold.png`) });

        await page.addStyleTag({
          content:
            '[data-testid="nav-pill"],[data-testid="site-header"]{visibility:hidden !important}',
        });
        await page.screenshot({
          path: path.join(OUT, `${viewport.id}-${locale}.png`),
          fullPage: true,
        });

        await context.close();
      });
    }
  }
});
