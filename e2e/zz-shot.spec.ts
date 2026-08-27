import { test } from "@playwright/test";
import { players, signInAs } from "./helpers/session";
test.use({ viewport: { width: 390, height: 844 } });
test("shot", async ({ page, context }) => {
  await signInAs(context, players.organizer);
  await page.goto("/admin/games", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(() => {
    const nav = document.querySelector('[data-testid="admin-nav-games"]')!.parentElement!;
    const s = getComputedStyle(nav);
    const last = document.querySelector('[data-testid="admin-nav-site"]')!;
    nav.scrollLeft = 9999;
    const box = last.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width/2, box.top + box.height/2);
    nav.scrollLeft = 0;
    return { mask: s.maskImage?.slice(0,46) ?? "none", sw: nav.scrollWidth, cw: nav.clientWidth, reachable: last.contains(hit) || last === hit };
  });
  console.log("SHOT " + JSON.stringify(r));
  await page.screenshot({ path: "/tmp/audit/f13-after.png", clip: { x: 0, y: 56, width: 390, height: 60 } });
});
