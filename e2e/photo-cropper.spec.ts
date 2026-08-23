import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { players, serviceClient, signInAs } from "./helpers/session";

/**
 * ROUND 16 ITEM 15 — choosing which part of a photograph becomes the banner.
 *
 * THE DEFECT WAS SILENT AND UNRECOVERABLE. `cropToRatio` took the centred
 * rectangle of the output's aspect: fine for a landscape photo, and for a
 * PORTRAIT one cropped to 3:1 a thin strip across whatever happened to be
 * halfway down. The player could not see that before uploading and could not
 * fix it afterwards except by finding a different photograph.
 *
 * SO THE TEST USES A TALL IMAGE WITH THREE DISTINCT BANDS and proves that
 * which band survives is the player's choice. A landscape fixture would pass
 * against the old centre crop and prove nothing.
 */

test.use({ viewport: { width: 390, height: 844 } });

/** A 400×1200 portrait: red top third, green middle, blue bottom. */
const TALL = { w: 400, h: 1200 };

async function bandedPortrait(page: import("@playwright/test").Page): Promise<Buffer> {
  const bytes = await page.evaluate(
    ({ w, h }) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext("2d")!;
      g.fillStyle = "#ff0000";
      g.fillRect(0, 0, w, h / 3);
      g.fillStyle = "#00ff00";
      g.fillRect(0, h / 3, w, h / 3);
      g.fillStyle = "#0000ff";
      g.fillRect(0, (2 * h) / 3, w, h / 3);
      return new Promise<number[]>((resolve) =>
        canvas.toBlob(
          (blob) => blob!.arrayBuffer().then((b) => resolve(Array.from(new Uint8Array(b)))),
          "image/png",
        ),
      );
    },
    TALL,
  );
  return Buffer.from(bytes);
}

/** Which channel dominates the middle of the rendered banner. */
async function bandColour(page: import("@playwright/test").Page): Promise<"r" | "g" | "b"> {
  const png = PNG.sync.read(await page.getByTestId("profile-cover-photo").screenshot());
  const i = (png.width * Math.floor(png.height / 2) + Math.floor(png.width / 2)) * 4;
  const [r, g, b] = [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
  if (r >= g && r >= b) return "r";
  return g >= b ? "g" : "b";
}

test("a tall photo is framed by the player, not by the middle of the file", async ({
  page,
  context,
}) => {
  const admin = serviceClient();
  await admin.from("players").update({ cover_path: null }).eq("id", players.runner.id);

  try {
    await signInAs(context, players.runner);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);
    await page.goto("/account", { waitUntil: "networkidle" });

    await page.setInputFiles('[data-testid="photo-input-cover"]', {
      name: "tall.png",
      mimeType: "image/png",
      buffer: await bandedPortrait(page),
    });

    const cropper = page.getByTestId("photo-cropper");
    await expect(cropper, "choosing a file no longer opens the cropper").toBeVisible();

    /*
     * THE FRAME IS THE OUTPUT'S ASPECT, exactly — 3:1 for the cover. A preview
     * at any other shape is a preview of something else, and the whole value
     * of a cropper is that what you see is what is stored.
     */
    const frame = await page.getByTestId("photo-cropper-frame").boundingBox();
    expect(frame!.width / frame!.height).toBeCloseTo(3, 1);

    /*
     * DRAG THE IMAGE DOWN, which moves the FRAME up the photograph: the top
     * band is red, so a downward drag lands red in the frame. This is the
     * assertion the old centre crop cannot pass — it would show green whatever
     * anybody did.
     */
    const box = frame!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 600, { steps: 12 });
    await page.mouse.up();

    await page.getByTestId("photo-cropper-save").click();

    await expect
      .poll(async () => bandColour(page), {
        timeout: 20_000,
        message: "the framed band is not the one the player chose",
      })
      .toBe("r");
  } finally {
    await admin.from("players").update({ cover_path: null }).eq("id", players.runner.id);
  }
});

test("the frame is always covered — no letterbox can be saved", async ({ page, context }) => {
  const admin = serviceClient();
  await admin.from("players").update({ cover_path: null }).eq("id", players.runner.id);

  try {
    await signInAs(context, players.runner);
    await page.goto("/account", { waitUntil: "networkidle" });

    await page.setInputFiles('[data-testid="photo-input-cover"]', {
      name: "tall.png",
      mimeType: "image/png",
      buffer: await bandedPortrait(page),
    });

    const frame = page.getByTestId("photo-cropper-frame");
    const box = (await frame.boundingBox())!;

    /*
     * DRAG FAR PAST THE EDGE IN BOTH DIRECTIONS. The clamp must hold: there is
     * no position from which a strip of empty frame can be saved, because a
     * banner with a black stripe down one side has no obvious culprit weeks
     * later.
     */
    for (const [dx, dy] of [
      [4000, 4000],
      [-4000, -4000],
    ]) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, {
        steps: 8,
      });
      await page.mouse.up();

      const gap = await frame.evaluate((el) => {
        const image = el.querySelector("img")!;
        const f = el.getBoundingClientRect();
        const i = image.getBoundingClientRect();
        return {
          left: i.left - f.left,
          top: i.top - f.top,
          right: f.right - i.right,
          bottom: f.bottom - i.bottom,
        };
      });

      // Every edge of the image must be at or outside the frame's, allowing a
      // sub-pixel rounding slack.
      expect(gap.left, "a gap opened on the left").toBeLessThanOrEqual(0.5);
      expect(gap.top, "a gap opened at the top").toBeLessThanOrEqual(0.5);
      expect(gap.right, "a gap opened on the right").toBeLessThanOrEqual(0.5);
      expect(gap.bottom, "a gap opened at the bottom").toBeLessThanOrEqual(0.5);
    }
  } finally {
    await admin.from("players").update({ cover_path: null }).eq("id", players.runner.id);
  }
});

test("cancelling uploads nothing", async ({ page, context }) => {
  const admin = serviceClient();
  await admin.from("players").update({ cover_path: null }).eq("id", players.runner.id);

  try {
    await signInAs(context, players.runner);
    await page.goto("/account", { waitUntil: "networkidle" });

    await page.setInputFiles('[data-testid="photo-input-cover"]', {
      name: "tall.png",
      mimeType: "image/png",
      buffer: await bandedPortrait(page),
    });

    await page.getByTestId("photo-cropper-cancel").click();
    await expect(page.getByTestId("photo-cropper")).toHaveCount(0);

    /*
     * Nothing was written. Asserted after a wait rather than immediately —
     * "it has not happened yet" and "it will not happen" are different
     * claims, and only the second one matters.
     */
    await page.waitForTimeout(2500);
    const { data } = await admin
      .from("players")
      .select("cover_path")
      .eq("id", players.runner.id)
      .single();
    expect(data?.cover_path, "cancelling still uploaded the photo").toBeNull();
  } finally {
    await admin.from("players").update({ cover_path: null }).eq("id", players.runner.id);
  }
});
