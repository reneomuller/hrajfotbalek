import { expect, test } from "@playwright/test";
import { CROP_OUTPUT } from "../lib/storage/avatar";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { players, serviceClient, signInAs } from "./helpers/session";

/**
 * ROUND 32, ITEM 1 — THE VENUE ADJUSTER *IS* THE BANNER ADJUSTER.
 *
 * WHY THEY DIFFERED. `PhotoUpload` carried the same decision twice as two
 * ternaries — one choosing what to ENCODE, one choosing what the cropper
 * DRAWS — and round 30 added a `venue` arm to the first and not the second.
 * So a venue photo was composed in the AVATAR's 1:1 window and saved at the
 * band's 1.875:1: a wide strip taken out of the middle of a square the
 * organizer had carefully filled. Same component, same portal, same drag —
 * and a window shaped like neither the banner nor the band.
 *
 * `crop-frames.spec.ts` could not catch it: it measures the COVER cropper and
 * the two rendered bands, and never opened the venue cropper at all.
 *
 * THIS FILE OPENS BOTH WITH THE SAME PHOTOGRAPH and asserts that everything
 * except the window's aspect is identical — which is the acceptance as
 * written, and the reason the assertions below are about SAMENESS rather than
 * about particular numbers.
 */

test.use({ viewport: { width: 390, height: 844 } });

/** One portrait photo, used in both flows, so the comparison is like-for-like. */
async function portrait(page: import("@playwright/test").Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 900;
    c.height = 1600;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#c8ff00";
    ctx.fillRect(0, 0, 900, 1600);
    ctx.fillStyle = "#101010";
    ctx.fillRect(0, 500, 900, 600);
    return c.toDataURL("image/png");
  });
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

/** Everything about the dialog that must be the same on both surfaces. */
async function readCropper(page: import("@playwright/test").Page) {
  const dialog = page.getByTestId("photo-cropper");
  await expect(dialog).toBeVisible();

  const chrome = await dialog.evaluate((el) => {
    const s = getComputedStyle(el);
    const scrim = document.querySelector('[data-testid="photo-cropper"]')!
      .previousElementSibling as HTMLElement | null;
    return {
      position: s.position,
      zIndex: s.zIndex,
      width: Math.round(el.getBoundingClientRect().width),
      role: el.getAttribute("role"),
      modal: el.getAttribute("aria-modal"),
      scrimBg: scrim ? getComputedStyle(scrim).backgroundColor : null,
    };
  });

  const frame = (await page.getByTestId("photo-cropper-frame").boundingBox())!;
  const stage = (await page.getByTestId("photo-cropper-stage").boundingBox())!;
  const outline = await page
    .getByTestId("photo-cropper-frame")
    .evaluate((el) => getComputedStyle(el).boxShadow);
  const dim = await page
    .getByTestId("photo-cropper-stage")
    .evaluate((el) => {
      const img = el.querySelector("img[aria-hidden]") as HTMLElement | null;
      return img ? getComputedStyle(img).opacity : null;
    });

  return {
    chrome,
    outline,
    dim,
    aspect: +(frame.width / frame.height).toFixed(3),
    reveal: Math.round(frame.x - stage.x),
    hasZoom: await page.getByTestId("photo-cropper-zoom").isVisible(),
  };
}

test("the venue adjuster and the banner adjuster differ ONLY in the window's aspect", async ({
  page,
  context,
}) => {
  await signInAs(context, players.organizer);
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);

  // --- the BANNER, which is the reference implementation ---------------------
  await serviceClient()
    .from("players")
    .update({ cover_path: null })
    .eq("id", players.organizer.id);
  await page.goto("/account", { waitUntil: "networkidle" });
  await page.setInputFiles('[data-testid="photo-input-cover"]', {
    name: "portrait.png",
    mimeType: "image/png",
    buffer: await portrait(page),
  });
  const banner = await readCropper(page);
  await page.getByTestId("photo-cropper-cancel").click();

  // --- the VENUE ------------------------------------------------------------
  await page.goto("/admin/venues", { waitUntil: "networkidle" });
  await page.getByTestId("venue-photo-input").first().setInputFiles({
    name: "portrait.png",
    mimeType: "image/png",
    buffer: await portrait(page),
  });
  const venue = await readCropper(page);

  // --- the window presentation is the same object ---------------------------
  expect(venue.chrome, "the dialog is presented differently").toEqual(banner.chrome);

  // --- the treatment is the same -------------------------------------------
  expect(venue.outline, "the outline differs").toBe(banner.outline);
  expect(venue.dim, "the dimming differs").toBe(banner.dim);
  expect(venue.reveal, "the revealed margin differs").toBe(banner.reveal);
  expect(venue.hasZoom, "the venue has no zoom control").toBe(banner.hasZoom);

  // --- and the ONLY difference is the aspect, which is each surface's own ---
  expect(banner.aspect).toBeCloseTo(CROP_OUTPUT.cover.width / CROP_OUTPUT.cover.height, 1);
  expect(venue.aspect).toBeCloseTo(CROP_OUTPUT.venue.width / CROP_OUTPUT.venue.height, 1);
  expect(
    venue.aspect,
    "the venue window is the banner's shape — the aspect did not follow the surface",
  ).not.toBeCloseTo(banner.aspect, 1);
});

test("the venue window is NOT the avatar's square, which is what it used to be", async ({
  page,
  context,
}) => {
  /*
   * THE REGRESSION GUARD, NAMED. Before round 32 the venue fell through the
   * cropper's ternary to `AVATAR_SIDE_PX` in both dimensions — a 1:1 window.
   * Asserted as an absence so the missing-arm bug cannot come back quietly.
   */
  await signInAs(context, players.organizer);
  await page.goto("/admin/venues", { waitUntil: "networkidle" });
  await page.getByTestId("venue-photo-input").first().setInputFiles({
    name: "portrait.png",
    mimeType: "image/png",
    buffer: await portrait(page),
  });

  const frame = (await page.getByTestId("photo-cropper-frame").boundingBox())!;
  const aspect = frame.width / frame.height;

  expect(aspect, `the venue crop window is ${aspect.toFixed(2)}:1 — square is the old bug`)
    .toBeGreaterThan(1.5);
});
