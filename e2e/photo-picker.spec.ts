import { expect, test, type Page } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { PROFILE_PHOTOS_BUCKET, UPLOAD_TARGET_BYTES } from "../lib/storage/avatar";
import { createAccount, removeAccount, signInThroughForm } from "./helpers/accounts";
import { serviceClient } from "./helpers/session";

/**
 * ROUND 41 — "changing the profile pic is now glitching. i can't select many
 * of my photos. only like 1 in 5 it registers, the rest it just glitches and
 * jumps back to profile."
 *
 * Two faults, one symptom. The picker refused any original over 2 MB — the
 * bucket's limit, which applies to the CROP that is uploaded, never to the
 * photo that is picked — and on the avatar and the cover the refusal was
 * `sr-only`, so the picker closed and nothing at all appeared to happen.
 */

test.use({ viewport: { width: 390, height: 844 } });

/** A PNG of noise — incompressible, so a modest size is several megabytes. */
async function noisyPhoto(page: Page, width: number, height: number): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ([w, h]) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      const image = ctx.createImageData(w, h);
      for (let i = 0; i < image.data.length; i += 4) {
        image.data[i] = Math.random() * 255;
        image.data[i + 1] = Math.random() * 255;
        image.data[i + 2] = Math.random() * 255;
        image.data[i + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
      return canvas.toDataURL("image/png");
    },
    [width, height] as const,
  );
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" }]);
});

test("a phone-sized photo over 2 MB opens the cropper and becomes the avatar", async ({ page }) => {
  test.slow();

  // Arrange
  const account = await createAccount();
  try {
    await signInThroughForm(page, account);
    await page.goto("/account");
    const photo = await noisyPhoto(page, 1400, 1100);
    expect(photo.length, "the fixture must be over the bucket's 2 MB").toBeGreaterThan(2 * 1024 * 1024);

    // Act
    await page.getByTestId("photo-input").setInputFiles({ name: "IMG_0001.png", mimeType: "image/png", buffer: photo });

    // Assert — the cropper opens, and saving it stores a photo.
    await expect(page.getByTestId("photo-cropper-frame")).toBeVisible();
    await page.getByTestId("photo-cropper-save").click();
    await expect
      .poll(async () => {
        const { data } = await serviceClient()
          .from("players")
          .select("photo_path")
          .eq("id", account.playerId!)
          .maybeSingle();
        return (data as { photo_path: string | null } | null)?.photo_path ?? null;
      })
      .toMatch(/^players\//);
    await expect(page.getByTestId("account-avatar").locator("img")).toBeVisible();
  } finally {
    await serviceClient()
      .storage.from(PROFILE_PHOTOS_BUCKET)
      .remove([`players/${account.playerId}.webp`, `players/${account.playerId}.jpg`]);
    await removeAccount(account);
  }
});

test("a file the picker refuses says so on screen, not only to a screen reader", async ({ page }) => {
  // Arrange
  const account = await createAccount();
  try {
    await signInThroughForm(page, account);
    await page.goto("/account");

    // Act — a type the picker does not take (its `accept` filter is a hint a
    // browser may ignore; the check behind it is not).
    await page.getByTestId("photo-input").setInputFiles({
      name: "scan.gif",
      mimeType: "image/gif",
      buffer: Buffer.from("GIF89a"),
    });

    // Assert
    await expect(page.getByTestId("photo-error-toast")).toBeVisible();
    await expect(page.getByTestId("photo-error-toast")).toContainText("JPG, PNG or WebP");
    await expect(page.getByTestId("photo-cropper")).toHaveCount(0);
  } finally {
    await removeAccount(account);
  }
});

test("where the browser cannot write WebP, as on an iPhone, the photo is saved as a small JPEG", async ({
  page,
}) => {
  test.slow();

  // Arrange — Safari's behaviour: a WebP request answered with a PNG.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      original.call(this, callback, type === "image/webp" ? "image/png" : type, quality);
    };
  });
  const account = await createAccount();
  try {
    await signInThroughForm(page, account);
    await page.goto("/account");
    const photo = await noisyPhoto(page, 1400, 1100);

    // Act
    await page.getByTestId("photo-input").setInputFiles({ name: "IMG_0002.png", mimeType: "image/png", buffer: photo });
    await expect(page.getByTestId("photo-cropper-frame")).toBeVisible();
    await page.getByTestId("photo-cropper-save").click();

    // Assert — a .jpg key, JPEG bytes, inside the upload target.
    const path = `players/${account.playerId}.jpg`;
    await expect
      .poll(async () => {
        const { data } = await serviceClient()
          .from("players")
          .select("photo_path")
          .eq("id", account.playerId!)
          .maybeSingle();
        return (data as { photo_path: string | null } | null)?.photo_path ?? null;
      })
      .toBe(path);
    await expect
      .poll(async () => (await serviceClient().storage.from(PROFILE_PHOTOS_BUCKET).download(path)).data?.type ?? null)
      .toBe("image/jpeg");
    const { data: stored } = await serviceClient().storage.from(PROFILE_PHOTOS_BUCKET).download(path);
    expect(stored!.size).toBeLessThanOrEqual(UPLOAD_TARGET_BYTES);
  } finally {
    await serviceClient()
      .storage.from(PROFILE_PHOTOS_BUCKET)
      .remove([`players/${account.playerId}.webp`, `players/${account.playerId}.jpg`]);
    await removeAccount(account);
  }
});
