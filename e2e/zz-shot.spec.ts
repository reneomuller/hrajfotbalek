import { test } from "@playwright/test";
import { players, signInAs } from "./helpers/session";
test.use({ viewport: { width: 390, height: 844 } });
test("shot", async ({ page, context }) => {
  await signInAs(context, players.runner);
  await page.goto("/games", { waitUntil: "networkidle" });
  const r = await page.evaluate(() =>
    ["locale-trigger","notification-bell","nav-account"].map((id) => {
      const e = document.querySelector(`[data-testid="${id}"]`);
      return { id, h: e ? Math.round(e.getBoundingClientRect().height*10)/10 : null };
    }));
  console.log("SHOT " + JSON.stringify(r));
  await page.screenshot({ path: "/tmp/audit/f15-after.png", clip: { x: 0, y: 0, width: 390, height: 110 } });
});
