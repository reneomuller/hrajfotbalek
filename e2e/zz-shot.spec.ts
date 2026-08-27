import { test } from "@playwright/test";
import { players, serviceClient, signInAs } from "./helpers/session";
test.use({ viewport: { width: 390, height: 844 } });
test("shot", async ({ page, context }) => {
  await signInAs(context, players.organizer);
  const admin = serviceClient();
  const { data } = await admin.from("games").select("id").eq("status","published").limit(1).single();
  await page.goto(`/admin/games/${data!.id}`, { waitUntil: "networkidle" });
  const r = await page.evaluate(() => {
    const out: Record<string, number|null> = {};
    for (const id of ["skill-beginner","organizer-name","duration-minutes","venue-select","starts-at"]) {
      const e = document.querySelector(`[data-testid="${id}"]`);
      if (!e) { out[id] = null; continue; }
      const target = id.startsWith("skill") ? e.closest("label")! : e;
      out[id] = Math.round(target.getBoundingClientRect().height*10)/10;
    }
    return out;
  });
  console.log("SHOT " + JSON.stringify(r));
});
