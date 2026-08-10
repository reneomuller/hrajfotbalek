import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LOCALE_COOKIE } from "../lib/i18n/locales";

/**
 * THE STAGE 5 CHECKPOINT STRIPS — the home page under ruling J as amended.
 *
 * `docs/v13/strips/home/`, committed, for the same reason as every other
 * verdict strip: it is the artefact a decision is given against.
 *
 * BOTH WIDTHS, unlike the Stage 0 set. Stage 5's changes are structural — the
 * hero no longer forces a full screen, `All games` moved to the bottom of its
 * section, and the panels reordered — and a phone-only strip would show the
 * stacking order while hiding what the three-across panel row does with it.
 *
 * EN AND CS. Czech is the LAYOUT check, as always: it is the longest of the
 * three languages, so it is where the new bottom button and the step cards
 * overflow first.
 *
 * Full-page WITH the fixed layers hidden, then one viewport shot that keeps
 * them — the same split `strips-stage0.spec.ts` uses, and for the same reason:
 * a `fullPage` capture stamps a `position: fixed` element across the middle of
 * the image, which is an artefact of the capture rather than of the product.
 */

const OUT = path.resolve(process.cwd(), "docs/v13/strips/home");

const VIEWPORTS = [
  { id: "390", width: 390, height: 900 },
  { id: "desktop", width: 1280, height: 900 },
] as const;

test.describe("Stage 5 strips — home", () => {
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

        // Fonts loaded, or the strip records fallback metrics and every line
        // length in it is a lie — which matters more than usual this round,
        // since the face changed to Onest in the same stage.
        await page.evaluate(() => document.fonts.ready);
        await expect(page.getByTestId("how-it-works")).toBeVisible();

        await page.addStyleTag({
          content:
            "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
        });

        // The fold, with the chrome where it really is — this is the shot that
        // shows whether the three steps clear it.
        await page.screenshot({
          path: path.join(OUT, `${viewport.id}-${locale}-fold.png`),
        });

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
