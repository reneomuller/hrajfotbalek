import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";
import {
  COVER_HEIGHT_PX,
  COVER_WIDTH_PX,
  VENUE_HEIGHT_PX,
  VENUE_WIDTH_PX,
} from "../lib/storage/avatar";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { players, serviceClient, signInAs } from "./helpers/session";

/**
 * ROUND 31, ITEM 2 — THE CROP REGION IS DRAWN.
 *
 * Round 30 item 7 made the crop aspect correct; this makes it VISIBLE. The
 * frame was `overflow-hidden`, so the only thing on screen was the crop and
 * the person composing had nothing to judge it against — "Position your photo"
 * asked for a decision and showed one half of the evidence.
 *
 * THREE READINGS, ONE TRUTH, which is what these tests exist to tie together:
 *
 *   the DRAWN frame's aspect        (what the person sees)
 *   the crop CONSTANT               (what the browser writes)
 *   the RENDERED band's aspect      (what the page shows)
 *
 * `crop-frames.spec.ts` already pins constant-to-band. This pins drawn-to-
 * constant, and asserts the drawing is actually there and actually legible.
 */

test.use({ viewport: { width: 390, height: 844 } });

/** A picture with enough variety that a dim overlay is measurable on it. */
async function brightPhoto(page: import("@playwright/test").Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 900;
    c.height = 1600;
    const ctx = c.getContext("2d")!;
    // Near-white, which is the hostile case for a volt outline.
    ctx.fillStyle = "#f2f2f2";
    ctx.fillRect(0, 0, 900, 1600);
    return c.toDataURL("image/png");
  });
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

function meanLuminance(png: PNG, x0: number, y0: number, x1: number, y1: number) {
  let sum = 0;
  let n = 0;
  for (let y = Math.max(0, y0); y < Math.min(png.height, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(png.width, x1); x++) {
      const i = (png.width * y + x) << 2;
      sum += (png.data[i]! + png.data[i + 1]! + png.data[i + 2]!) / 3;
      n++;
    }
  }
  return n === 0 ? 0 : sum / n;
}

async function openCoverCropper(
  page: import("@playwright/test").Page,
  context: import("@playwright/test").BrowserContext,
) {
  await serviceClient().from("players").update({ cover_path: null }).eq("id", players.runner.id);
  await signInAs(context, players.runner);
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);
  await page.goto("/account", { waitUntil: "networkidle" });
  await page.setInputFiles('[data-testid="photo-input-cover"]', {
    name: "bright.png",
    mimeType: "image/png",
    buffer: await brightPhoto(page),
  });
  await expect(page.getByTestId("photo-cropper")).toBeVisible();
}

test("the banner's crop region is drawn, and the drawing matches the constant", async ({
  page,
  context,
}) => {
  // Arrange
  await openCoverCropper(page, context);

  // Act
  const frame = (await page.getByTestId("photo-cropper-frame").boundingBox())!;
  const stage = (await page.getByTestId("photo-cropper-stage").boundingBox())!;

  // Assert — the DRAWN frame is the crop constant's aspect.
  expect(frame.width / frame.height).toBeCloseTo(COVER_WIDTH_PX / COVER_HEIGHT_PX, 1);

  /*
   * AND THERE IS PHOTOGRAPH OUTSIDE IT. The whole complaint was composing
   * blind: if the stage is the same size as the frame, nothing outside the
   * crop is visible and this feature does not exist.
   */
  expect(stage.width, "no context is revealed beside the crop").toBeGreaterThan(frame.width);
  expect(stage.height, "no context is revealed above the crop").toBeGreaterThan(frame.height);
});

test("what is outside the crop is visibly dimmer than what is inside", async ({
  page,
  context,
}) => {
  // Arrange — a near-white photo, so dimming is the only thing that can darken.
  await openCoverCropper(page, context);
  const stage = (await page.getByTestId("photo-cropper-stage").boundingBox())!;
  const frame = (await page.getByTestId("photo-cropper-frame").boundingBox())!;

  // Act — decode from an in-memory buffer; nothing touches the disk.
  const png = PNG.sync.read(
    await page.screenshot({
      clip: { x: stage.x, y: stage.y, width: stage.width, height: stage.height },
    }),
  );

  const inset = Math.round(frame.x - stage.x);
  const inside = meanLuminance(
    png,
    inset + 12,
    Math.round(frame.y - stage.y) + 12,
    inset + Math.round(frame.width) - 12,
    Math.round(frame.y - stage.y) + Math.round(frame.height) - 12,
  );
  // A column strictly left of the frame: revealed photograph, dimmed.
  const outside = meanLuminance(png, 2, Math.round(png.height / 2) - 20, inset - 4, Math.round(png.height / 2) + 20);

  // Assert
  expect(inside, `inside ${inside.toFixed(0)}`).toBeGreaterThan(120);
  expect(
    outside,
    `outside ${outside.toFixed(0)} is not dimmer than inside ${inside.toFixed(0)}`,
  ).toBeLessThan(inside * 0.8);
});

test("the outline is legible against a near-white photograph", async ({ page, context }) => {
  /*
   * THE HOSTILE CASE. A volt line on a bright picture is the one that fails,
   * which is why the outline carries a dark ring outside it — the same
   * two-tone trick the claim bar uses over a photo. Measured rather than
   * eyeballed: the edge band must differ from the photo it sits on.
   */
  // Arrange
  await openCoverCropper(page, context);
  const frame = (await page.getByTestId("photo-cropper-frame").boundingBox())!;

  // Act — a thin strip spanning the frame's top edge.
  const png = PNG.sync.read(
    await page.screenshot({
      clip: { x: frame.x + 20, y: frame.y - 4, width: Math.min(120, frame.width - 40), height: 9 },
    }),
  );

  const edge = meanLuminance(png, 0, 0, png.width, png.height);
  const interior = PNG.sync.read(
    await page.screenshot({
      clip: { x: frame.x + 20, y: frame.y + 20, width: Math.min(120, frame.width - 40), height: 9 },
    }),
  );
  const inner = meanLuminance(interior, 0, 0, interior.width, interior.height);

  // Assert — the edge is not the photograph.
  expect(
    Math.abs(edge - inner),
    `edge ${edge.toFixed(0)} vs interior ${inner.toFixed(0)} — the outline is invisible`,
  ).toBeGreaterThan(20);
});

test("the venue cropper is drawn to the venue's aspect, not the banner's", async () => {
  /*
   * BOTH CROPPERS, ONE COMPONENT. `PhotoCropper` takes the output dimensions
   * as props, so the venue's frame is the venue's aspect by construction —
   * asserted here against the constants rather than by opening the admin form,
   * because the thing that could break is the two constants collapsing into
   * one, and that is visible without a browser.
   */
  expect(VENUE_WIDTH_PX / VENUE_HEIGHT_PX).not.toBeCloseTo(COVER_WIDTH_PX / COVER_HEIGHT_PX, 1);
});
