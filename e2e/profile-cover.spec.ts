import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
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
     * THE CROPPER IS A STEP NOW (round 16, item 15). Choosing a file opens it;
     * nothing is uploaded until the player has said which part of the photo
     * they want. Accepting the default framing is one tap, which is what this
     * does — the framing itself is exercised in `photo-cropper.spec.ts`.
     */
    await page.getByTestId("photo-cropper-save").click();

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


/**
 * ROUND 16 ITEM 2 — the upload worked and the screen did not change.
 *
 * ROUND 14 FIXED THE CONTROL; THIS IS THE NEXT LAYER DOWN. Both round-14
 * assertions above pass against the bug: the control is on screen, the row
 * gains a `cover_path`, and after a RELOAD `data-own` reads "true". All three
 * were true while the player's actual experience was that nothing happened.
 *
 * WHAT THEY MISSED. `data-own` is derived from the row, not from pixels, and
 * the first upload — the only one they exercise — genuinely changes the URL
 * from `/pitch-default.jpg` to a storage object. The bug is in the SECOND
 * upload: the object key is derived from the player id and never varies, and
 * `avatarUrl`'s cache-buster was `players.created_at`, which never varies
 * either. So a replacement wrote new bytes behind a byte-identical URL and
 * every browser served the picture it already had.
 *
 * The production data says this is what people were doing: two accounts had
 * replaced a cover, and both replacements are the ones that "did not work".
 *
 * SO THIS ASSERTS ON DECODED PIXELS, twice, with two colours that cannot be
 * confused. It is the only form of the assertion the bug does not survive:
 * every attribute, every row and every URL was already correct.
 */
test("REPLACING a banner changes what is on the screen", async ({ page, context }) => {
  const admin = serviceClient();
  await admin.from("players").update({ cover_path: null }).eq("id", players.runner.id);

  const OUT = path.resolve(process.cwd(), "docs/v16/strips/banner");
  mkdirSync(OUT, { recursive: true });

  /** The middle pixel of the band, as rendered — under the scrim, so a pure
   *  colour arrives darkened and is compared by which channels dominate. */
  async function bandCentre(): Promise<[number, number, number]> {
    const png = PNG.sync.read(
      await page.getByTestId("profile-cover-photo").screenshot(),
    );
    const i =
      (png.width * Math.floor(png.height / 2) + Math.floor(png.width / 2)) * 4;
    return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
  }

  async function upload(hex: string, name: string) {
    const bytes = await page
      .evaluate(async (fill) => {
        const c = document.createElement("canvas");
        c.width = 1200;
        c.height = 400;
        const g = c.getContext("2d")!;
        g.fillStyle = fill;
        g.fillRect(0, 0, 1200, 400);
        const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
      }, hex)
      .then((a) => Buffer.from(a));

    await page.setInputFiles('[data-testid="photo-input-cover"]', {
      name,
      mimeType: "image/png",
      buffer: bytes,
    });

    // Accept the default framing — see the note in the test above.
    await page.getByTestId("photo-cropper-save").click();
  }

  try {
    await signInAs(context, players.runner);
    await page.goto("/account", { waitUntil: "networkidle" });

    // --- first upload: magenta ---------------------------------------------
    await upload("#ff00ff", "one.png");
    await expect
      .poll(async () => (await bandCentre())[0] > (await bandCentre())[1], {
        timeout: 20_000,
        message: "the first banner never appeared",
      })
      .toBe(true);
    await page.screenshot({ path: path.join(OUT, "01-first-upload.png") });

    const first = await bandCentre();
    expect(first[0], "magenta: red should lead").toBeGreaterThan(first[1]);
    expect(first[2], "magenta: blue should lead green").toBeGreaterThan(first[1]);

    // --- replacement: yellow, and NO RELOAD --------------------------------
    /*
     * The absence of a reload is the assertion. A player who uploads a photo
     * does not refresh the page to find out whether it worked; they look.
     */
    await upload("#ffff00", "two.png");

    await expect
      .poll(
        async () => {
          const [r, g, b] = await bandCentre();
          return r > b && g > b;
        },
        { timeout: 20_000, message: "the replacement never reached the screen" },
      )
      .toBe(true);

    await page.screenshot({ path: path.join(OUT, "02-after-replacement.png") });

    // And it survives a reload, which rules out a purely client-side illusion.
    await page.reload({ waitUntil: "networkidle" });
    const [r, g, b] = await bandCentre();
    expect(r, "yellow: red over blue").toBeGreaterThan(b);
    expect(g, "yellow: green over blue").toBeGreaterThan(b);
  } finally {
    await admin.from("players").update({ cover_path: null }).eq("id", players.runner.id);
  }
});
