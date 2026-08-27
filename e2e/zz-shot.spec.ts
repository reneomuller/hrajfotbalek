import { test } from "@playwright/test";
test.use({ viewport: { width: 390, height: 844 } });
test("shot", async ({ page }) => {
  await page.goto("/games", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const r = await page.evaluate(() => {
    const el = document.activeElement!;
    const s = getComputedStyle(el);
    return { tag: el.tagName, testid: el.getAttribute("data-testid"), outline: s.outlineWidth + " " + s.outlineStyle + " " + s.outlineColor, offset: s.outlineOffset };
  });
  console.log("SHOT " + JSON.stringify(r));
});
