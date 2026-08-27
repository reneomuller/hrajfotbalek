import { test } from "@playwright/test";
test.use({ viewport: { width: 390, height: 844 } });
test("shot", async ({ page }) => {
  await page.goto("/games", { waitUntil: "networkidle" });
  const r = await page.evaluate(() =>
    [...document.querySelectorAll("footer a, footer button")].map((e) => ({
      t: (e.textContent||"").trim().slice(0,14),
      h: Math.round(e.getBoundingClientRect().height * 10)/10,
    })));
  console.log("SHOT " + JSON.stringify(r));
});
