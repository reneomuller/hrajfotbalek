import { expect, test } from "@playwright/test";
import { players, serviceClient, signInAs } from "./helpers/session";

/**
 * ROUND 14 ITEM 3 — the banner control, which the owner could not use.
 *
 * THE UPLOAD ITSELF WAS NEVER BROKEN. `set_cover_photo` derived the right key,
 * the storage policy admitted it, and the image rendered after a reload —
 * round 12 verified all three against production. What failed was the CONTROL:
 * it rendered at x = -22, off the left edge of the screen, underneath the
 * profile tab row.
 *
 * `PhotoUpload`'s base class hardcoded `relative` and the cover passed
 * `absolute right-gutter top-2`. Two position utilities in one class string do
 * not resolve by their order in the attribute — they resolve by their order in
 * the STYLESHEET, and Tailwind emits `.absolute` before `.relative`. So
 * `relative` won, and the offsets moved an in-FLOW element instead of
 * positioning it.
 *
 * IT LOOKED FINE IN EVERY SCREENSHOT, because the thing was simply not where
 * anyone was looking. The assertions below are the two that would have caught
 * it: the box is inside the viewport, and `elementFromPoint` at its centre
 * returns the control rather than whatever is on top of it.
 */

test.use({ viewport: { width: 390, height: 844 } });

test("the cover control is on screen and nothing covers it", async ({ page, context }) => {
  await signInAs(context, players.runner);
  await page.goto("/account", { waitUntil: "networkidle" });

  const control = page.getByTestId("cover-upload-control");
  await expect(control).toBeVisible();

  const box = (await control.boundingBox())!;
  expect(box.x, "the control is off the left edge").toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, "the control runs off the right edge").toBeLessThanOrEqual(390);
  expect(box.y, "the control is above the viewport").toBeGreaterThanOrEqual(0);

  // It must be INSIDE the banner, not floating below it among the tabs.
  const band = (await page.getByTestId("profile-cover").boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(band.y + band.height);

  const reachable = await control.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return el.contains(hit) || el === hit;
  });
  expect(reachable, "something is covering the cover control").toBe(true);
});

test("a player uploads a banner and it survives a reload", async ({ page, context }) => {
  const admin = serviceClient();
  await admin.from("players").update({ cover_path: null }).eq("id", players.runner.id);

  try {
    await signInAs(context, players.runner);
    await page.goto("/account", { waitUntil: "networkidle" });

    // The default pitch, to begin with.
    await expect(page.getByTestId("profile-cover-photo")).toHaveAttribute("data-own", "false");

    const png = await page
      .evaluate(async () => {
        const c = document.createElement("canvas");
        c.width = 1200;
        c.height = 400;
        const g = c.getContext("2d")!;
        g.fillStyle = "#0b3d2e";
        g.fillRect(0, 0, 1200, 400);
        const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
      })
      .then((a) => Buffer.from(a));

    await page.setInputFiles('[data-testid="photo-input-cover"]', {
      name: "banner.png",
      mimeType: "image/png",
      buffer: png,
    });

    /*
     * ASSERTED ON THE ROW, not on a re-render. The upload finishes with
     * `router.refresh()`, and a client-state marker can be unmounted before it
     * is observed (CLAUDE.md).
     */
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("players")
            .select("cover_path")
            .eq("id", players.runner.id)
            .single();
          return data?.cover_path ?? null;
        },
        { timeout: 20000 },
      )
      .toContain(".cover.");

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByTestId("profile-cover-photo")).toHaveAttribute("data-own", "true");
  } finally {
    await admin.from("players").update({ cover_path: null }).eq("id", players.runner.id);
  }
});
