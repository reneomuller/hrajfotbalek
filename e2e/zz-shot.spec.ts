import { test } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { signOut } from "./helpers/session";
test.use({ viewport: { width: 390, height: 844 } });
test("shot", async ({ page, context }) => {
  await signOut(context);
  await context.addCookies([{ name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" }]);
  await page.goto("/games", { waitUntil: "networkidle" });
  const empty = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="day-tab"]')]
      .filter((e) => e.getAttribute("data-empty") === "true")
      .map((e) => e.getAttribute("href"))[0] ?? null);
  if (empty) {
    await page.goto(empty, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: process.env.SHOT!, clip: { x: 0, y: 0, width: 390, height: 460 } });
    const r = await page.evaluate(() => ({
      rows: document.querySelectorAll('[data-testid="game-row"]').length,
      selected: document.querySelector('[data-testid="day-tab"][data-selected="true"]')?.getAttribute("data-day") ?? null,
      all: document.querySelector('[data-testid="day-tab-all"]')?.getAttribute("data-selected"),
    }));
    console.log("SHOT " + JSON.stringify(r));
  }
});
