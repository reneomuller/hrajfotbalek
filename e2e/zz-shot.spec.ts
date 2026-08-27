import { test } from "@playwright/test";
test("shot", async ({ page }) => {
  const res = await page.goto("/game/00000000-0000-4000-8000-000000000000", { waitUntil: "networkidle" });
  console.log("SHOT status " + res?.status());
  console.log("SHOT body " + (await page.locator("body").innerText()).replace(/\n/g," ").slice(0,150));
  await page.screenshot({ path: "/tmp/audit/f10-after.png", clip: { x: 0, y: 0, width: 390, height: 420 } });
});
