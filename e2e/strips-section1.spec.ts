import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { players, signInAs } from "./helpers/session.ts";

/**
 * SECTION 1 STRIPS — the desktop header, and a Czech-default page load.
 *
 * `docs/v13/strips/section1/`.
 *
 * THE CZECH STRIP IS TAKEN WITH NO COOKIE AND NO USABLE `Accept-Language`,
 * which is the only configuration that proves anything: a Czech cookie would
 * render Czech whatever the default was.
 *
 * MY FIRST VERSION OF THIS TEST WAS WRONG AND THE PRODUCT WAS RIGHT. It set
 * `locale: "en-US"` and expected Czech — but an English-preferring browser
 * sends `Accept-Language: en-US`, which is STEP 2 of the ladder and outranks
 * the default by design. Getting Czech there would have meant the "default"
 * was a forcing. The context now advertises a language the product does not
 * speak, which is the real case this default exists for: no cookie, no
 * supported preference, so step 3 decides.
 */

const OUT = path.resolve(process.cwd(), "docs/v13/strips/section1");

test.describe("Section 1 strips", () => {
  test("the desktop header, signed out and as an admin", async ({ browser }) => {
    mkdirSync(OUT, { recursive: true });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();

    await page.goto("/games", { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);

    // Home and Profile are gone as TEXT; the wordmark and the avatar carry them.
    await expect(page.getByTestId("nav-games")).toBeVisible();
    await expect(page.getByTestId("nav-home")).toHaveCount(0);
    await expect(page.getByTestId("nav-profile")).toHaveCount(0);
    await page.locator("header").screenshot({
      path: path.join(OUT, "header-desktop-signed-out.png"),
    });

    // An admin sees the door, and the avatar replaces the sign-in button.
    await signInAs(context, players.organizer);
    await page.goto("/games", { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByTestId("nav-admin")).toBeVisible();
    await expect(page.getByTestId("nav-account")).toHaveAttribute("href", "/account");
    await page.locator("header").screenshot({
      path: path.join(OUT, "header-desktop-admin.png"),
    });

    await context.close();
  });

  test("a visitor with no stored choice and no supported preference gets Czech", async ({
    browser,
  }) => {
    mkdirSync(OUT, { recursive: true });

    const context = await browser.newContext({
      viewport: { width: 390, height: 900 },
      // German: supported by nobody here, so the ladder falls through to the
      // default. `de` is deliberate — an `en-US` browser correctly gets
      // English, which is the ladder working rather than failing.
      locale: "de-DE",
    });
    const page = await context.newPage();

    /*
     * No `hf_locale` cookie is set anywhere in this test — that is the point.
     *
     * ~~`/games` and its h1.~~ The heading went in round 13 item 16, so the
     * probe is the HOME HERO: a translated sentence in the largest type on the
     * site, which is a stronger proof that the whole table resolved than a
     * single heading was.
     */
    await page.goto("/", { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);

    // Case-insensitive: the hero is uppercased in CSS, and `toContainText`
    // reads textContent rather than the rendered glyphs.
    await expect(page.getByTestId("hero-headline")).toHaveText(/hraj fotbal/i);
    // And the switcher is still there, which is what makes it a default
    // rather than a forcing.
    await expect(page.getByTestId("locale-trigger")).toBeVisible();

    await page.addStyleTag({
      content:
        "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
    });
    await page.screenshot({ path: path.join(OUT, "czech-default-390.png") });

    await context.close();
  });
});
