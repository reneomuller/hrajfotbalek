import { test } from "@playwright/test";
import { players, signInAs } from "./helpers/session";
test.use({ viewport: { width: 390, height: 844 } });
test("shot", async ({ page, context }) => {
  await signInAs(context, players.runner);
  const seen = new Set<string>();
  for (const u of ["/", "/games", "/account", "/pass"]) {
    await page.goto(u, { waitUntil: "networkidle" });
    (await page.evaluate(() => {
      const s = new Set<string>();
      document.querySelectorAll("body *").forEach((e) => {
        const r = getComputedStyle(e).borderTopLeftRadius;
        if (parseFloat(r) > 100) s.add(r);
      });
      return [...s];
    })).forEach((r) => seen.add(r));
  }
  console.log("SHOT round radii in use: " + JSON.stringify([...seen]));
});
