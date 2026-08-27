import { test } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { serviceClient, signOut } from "./helpers/session";
test.use({ viewport: { width: 390, height: 844 } });
test("shot", async ({ page, context }) => {
  await signOut(context);
  const admin = serviceClient();
  const { data } = await admin.from("games").select("id").eq("status","published").limit(1).single();
  await context.addCookies([{ name: LOCALE_COOKIE, value: process.env.LOC ?? "ru", domain: "localhost", path: "/" }]);
  await page.goto(`/game/${data!.id}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const box = await page.getByTestId("game-info-card").boundingBox();
  await page.screenshot({ path: process.env.SHOT!, clip: { x: 0, y: box!.y, width: 390, height: Math.min(box!.height, 260) } });
  const r = await page.evaluate(() => [...document.querySelectorAll('[data-testid="game-info-card"] dt')].map((el) => ({
    t: (el.textContent||"").trim(), cw: el.clientWidth, sw: el.scrollWidth, over: el.scrollWidth > el.clientWidth + 1,
  })));
  console.log("SHOT " + JSON.stringify(r));
});
