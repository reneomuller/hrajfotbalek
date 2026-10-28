import { expect, type Locator, type Page } from "@playwright/test";
import { PNG } from "pngjs";

/**
 * PHOTO REPLACEMENT, DECODED (round 41): a new query string proves a new URL,
 * not a new picture. Upload a solid colour, replace it with another, and read
 * the colour back out of a fresh in-memory capture of each surface. Solid, so
 * no crop can matter.
 */

export const MAGENTA = [255, 0, 255] as const;
export const YELLOW = [255, 255, 0] as const;

export async function solidImage(page: Page, rgb: readonly number[]): Promise<Buffer> {
  const dataUrl = await page.evaluate((fill) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 900;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = `rgb(${fill.join(",")})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  }, [...rgb]);
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

/** The average colour of the middle of an image element, read from a fresh capture. */
export async function centreColour(page: Page, target: Locator): Promise<number[]> {
  await target.scrollIntoViewIfNeeded();
  await expect
    .poll(() => target.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
    .toBe(true);
  const box = (await target.boundingBox())!;
  const png = PNG.sync.read(
    await page.screenshot({
      clip: { x: box.x + box.width / 2 - 4, y: box.y + box.height / 2 - 4, width: 8, height: 8 },
    }),
  );
  const sum = [0, 0, 0];
  for (let i = 0; i < png.data.length; i += 4) {
    sum[0]! += png.data[i]!;
    sum[1]! += png.data[i + 1]!;
    sum[2]! += png.data[i + 2]!;
  }
  const pixels = png.data.length / 4;
  return sum.map((channel) => Math.round(channel / pixels));
}

/**
 * By hue, not by value: the card and the hero lay a dark gradient over the
 * photograph, which scales every channel down but keeps their order.
 */
export function isColour(actual: number[], expected: readonly number[]): boolean {
  const [r, g, b] = actual as [number, number, number];
  return expected === MAGENTA ? r > g + 40 && b > g + 40 : r > b + 40 && g > b + 40;
}

/** Picks a file into a photo control and saves the cropper's default frame. */
export async function uploadThroughCropper(page: Page, input: Locator, image: Buffer): Promise<void> {
  // Re-picked until the cropper opens: a file chosen before the control has
  // hydrated goes to a bare input with no change handler, and nothing happens.
  await expect(async () => {
    await input.setInputFiles({ name: "solid.png", mimeType: "image/png", buffer: image });
    await expect(page.getByTestId("photo-cropper-frame")).toBeVisible({ timeout: 2000 });
  }).toPass();
  await page.getByTestId("photo-cropper-save").click();
  await expect(page.getByTestId("photo-cropper")).toBeHidden();
}
