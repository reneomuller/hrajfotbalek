import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { players, signInAs } from "./helpers/session.ts";

/**
 * THE STAGE 3 CHECKPOINT STRIPS — the profile block, display and edit.
 *
 * `docs/v13/strips/profile/`, committed, as every verdict strip is.
 *
 * BOTH WIDTHS AND BOTH LANGUAGES. Czech is the layout check as always — it is
 * the longest of the three, and `Preferovaný post` over four position chips is
 * where the chip row wraps first.
 *
 * THE EDIT STRIP IS CAPTURED WITH EVERY CHIP SELECTED, deliberately: §2.8 says
 * the control "must be drawn in the state where more chips are selected than
 * fit one row", so a strip of the resting state would omit the one frame the
 * ruling asks for by name.
 *
 * The runner's row is written by these strips and restored at the end — this
 * suite reads the seed tableau and must not leave it changed.
 */

const OUT = path.resolve(process.cwd(), "docs/v13/strips/profile");

const VIEWPORTS = [
  { id: "390", width: 390, height: 900 },
  { id: "desktop", width: 1280, height: 900 },
] as const;

test.describe("Stage 3 strips — profile", () => {
  for (const viewport of VIEWPORTS) {
    for (const locale of ["en", "cs"] as const) {
      test(`profile at ${viewport.id} — ${locale}`, async ({ browser }) => {
        mkdirSync(OUT, { recursive: true });

        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
        });
        await context.addCookies([
          { name: LOCALE_COOKIE, value: locale, domain: "localhost", path: "/" },
        ]);
        await signInAs(context, players.runner);

        const page = await context.newPage();
        await page.goto("/account", { waitUntil: "networkidle" });
        await page.evaluate(() => document.fonts.ready);
        await page.addStyleTag({
          content:
            "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
        });

        const block = page.getByTestId("profile-details");
        await expect(block).toBeVisible();
        await block.screenshot({ path: path.join(OUT, `${viewport.id}-${locale}-display.png`) });

        // --- edit mode, with every chip selected (§2.8's required state) ---
        await page.getByTestId("edit-details").click();
        for (const code of ["gk", "def", "mid", "att"]) {
          const chip = page.getByTestId(`position-chip-${code}`);
          if (!(await chip.locator("input").isChecked())) await chip.click();
          // Asserted, not assumed — a strip of an unselected chip labelled as
          // the selected state is evidence of the wrong thing.
          await expect(chip.locator("input")).toBeChecked();
        }

        /*
         * LET THE FILL SETTLE. The chips carry `transition-colors`, and the
         * first capture caught the last two mid-animation — they rendered as
         * a dim olive, which reads as "disabled" rather than "selected" and
         * made the strip evidence for a defect that did not exist.
         */
        await page.waitForTimeout(400);
        await page.evaluate(() => document.fonts.ready);
        await block.screenshot({ path: path.join(OUT, `${viewport.id}-${locale}-edit.png`) });

        // Leave the row as it was found.
        await page.getByTestId("cancel-edit").click();
        await context.close();
      });
    }
  }
});
