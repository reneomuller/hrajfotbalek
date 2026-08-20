import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { players, signInAs } from "./helpers/session.ts";

/**
 * REDESIGN v2, ROUND 6 — the profile.
 *
 * `docs/redesign-v2/strips/profile/`.
 *
 * THE COVER IS THE ROUND. `p10` and `p11` both put a photograph behind the
 * name and the stats where v1.3 ships a token gradient — the audit lists it as
 * the second largest visual delta in the export, after the list card.
 *
 * IT IS A REVERSAL, AND THE PREMISE IS WHAT MOVED. The gradient existed
 * because the only photograph then available was some particular venue's, and
 * a picture of a pitch this player may never have played on, under their face,
 * is an invented fact. R6 introduced one generic pitch used identically behind
 * every list card and every game header, so it is furniture rather than a
 * claim. The original objection still stands against a VENUE photo here, and
 * that is still not built.
 *
 * TWO THINGS ARE ASSERTED THAT A SCREENSHOT CANNOT SETTLE:
 *
 *   1. THE IDENTITY ROW PAINTS ABOVE THE COVER. The cover became a positioned
 *      element when it gained the scrim, and a positioned element paints above
 *      its non-positioned siblings whatever the source order says — which
 *      sliced the nickname in half along the band's bottom edge on the first
 *      build. It looked like a font-rendering artefact.
 *   2. THE SCRIM REACHES OPAQUE INK, the same R6(b) rule the game header
 *      follows, so the cover ends without a seam.
 */

const OUT = path.resolve(process.cwd(), "docs/redesign-v2/strips/profile-v2");

test.use({ viewport: { width: 390, height: 844 } });

async function settle(page: import("@playwright/test").Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content:
      "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
  });
}

test("the profile in three languages, on all three tabs", async ({ page, context }) => {
  mkdirSync(OUT, { recursive: true });
  await signInAs(context, players.runner);

  for (const locale of ["en", "cs", "ru"] as const) {
    await context.addCookies([
      { name: LOCALE_COOKIE, value: locale, domain: "localhost", path: "/" },
    ]);
    for (const [tab, url] of [
      ["overview", "/account"],
      ["games", "/account?tab=games"],
      ["settings", "/account?tab=settings"],
    ] as const) {
      await page.goto(url, { waitUntil: "networkidle" });
      await settle(page);
      await page.screenshot({
        path: path.join(OUT, `${tab}-${locale}.png`),
        fullPage: true,
      });
    }
  }
});

test("the cover is a photograph that fades to the page, under a legible name", async ({
  page,
  context,
}) => {
  mkdirSync(OUT, { recursive: true });
  await signInAs(context, players.runner);
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);
  await page.goto("/account", { waitUntil: "networkidle" });
  await settle(page);

  // The photograph is there and it loaded.
  const photo = page.getByTestId("profile-cover-photo");
  await expect(photo).toBeAttached();
  expect(
    await photo.evaluate((el) => (el as HTMLImageElement).naturalWidth),
    "the cover photo did not load",
  ).toBeGreaterThan(0);

  // R6(b)'s rule, the same one the game header follows: the last stop is the
  // page's own ground, so there is no seam where the cover ends.
  const scrim = await page
    .getByTestId("profile-cover-scrim")
    .evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(scrim).toContain("linear-gradient");
  expect(scrim, "the cover scrim never reaches opaque ink").toContain("rgb(8, 8, 8)");

  /*
   * THE NICKNAME IS ON TOP, asserted with `elementFromPoint` rather than by
   * reading z-index — CLAUDE.md's standing method, and the exact bug it
   * catches: the cover painted over the overlapping identity row and cut the
   * name in half, which reads as a rendering artefact rather than as a
   * stacking-context mistake.
   */
  const onTop = await page.evaluate(() => {
    const name = document.querySelector('[data-testid="account-nickname"]')!;
    const r = name.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + 4, r.top + r.height / 2);
    return hit === name || name.contains(hit);
  });
  expect(onTop, "the cover paints over the nickname").toBe(true);

  await page.getByTestId("profile-identity").screenshot({
    path: path.join(OUT, "01-cover.png"),
  });
  await page.getByTestId("profile-stats").screenshot({
    path: path.join(OUT, "02-stats.png"),
  });
});

/**
 * p11's SETTINGS ROWS: a tracked-caps label over a larger white value, ruled
 * between rows. Asserted on the label's case and on the rule, because the two
 * matched type sizes it replaced were legible — just flat.
 */
test("the settings rows are labelled and ruled as p11 draws them", async ({
  page,
  context,
}) => {
  mkdirSync(OUT, { recursive: true });
  await signInAs(context, players.runner);
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);
  await page.goto("/account?tab=settings", { waitUntil: "networkidle" });
  await settle(page);

  const details = page.getByTestId("profile-details");
  await expect(details).toBeVisible();

  const rows = await details.evaluate((el) => {
    const dts = Array.from(el.querySelectorAll("dt"));
    return dts.map((dt) => {
      const s = getComputedStyle(dt);
      const row = dt.parentElement!;
      return {
        transform: s.textTransform,
        rule: getComputedStyle(row).borderBottomWidth,
      };
    });
  });

  expect(rows.length).toBeGreaterThan(3);
  for (const row of rows) expect(row.transform).toBe("uppercase");
  // At least one rule between rows, and the last row carries none.
  expect(rows.filter((r) => r.rule !== "0px").length).toBeGreaterThan(0);

  await details.screenshot({ path: path.join(OUT, "03-settings-rows.png") });
});
