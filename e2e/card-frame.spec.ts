import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold";
import { players, serviceClient, signInAs } from "./helpers/session";
import { YELLOW, solidImage } from "./helpers/solidPhoto";

/**
 * THE CARD SHOWS THE FRAME AS IT WAS FRAMED, AT EVERY WIDTH (2026-11-16): the
 * same shape, scale and place as the crop window, and never less than its lit
 * part — below that the window is solid ink as well. The owner: "i would like for me to select the photo, crop it
 * to fit the outline, and for it to show up the same exact way on the game
 * card", and "currently it also shows up differently on phone and pc".
 *
 * `crop-truth.spec.ts` proves the framing with a marked image at a phone and a
 * laptop width; this measures the geometry at four widths, and proves the crop
 * window darkens the way the card does.
 */
const FRAME_ASPECT = 1600 / 740;
const WIDTHS = [360, 390, 430, 1280] as const;
/** Where `CardPhotoScrim`'s ramp reaches solid ink. */
const LIT_SHARE = 0.7;

test("the card's photograph keeps the frame's shape at every width, and the card never cuts its lit part", async ({
  page,
}) => {
  // Arrange
  const game = await createScratchGame({ hoursFromNow: 48, format: "6v6" });
  try {
    const heights = new Map<number, number>();
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });

      // Act
      await page.goto("/games", { waitUntil: "networkidle" });
      const card = page.locator(`[data-testid="game-row"][data-game-id="${game.id}"]`);
      await card.scrollIntoViewIfNeeded();
      const box = await card.evaluate((el) => {
        const outer = el.getBoundingClientRect();
        const border = parseFloat(getComputedStyle(el).borderTopWidth);
        const photo = el.querySelector('[data-testid="card-photo"]')!.getBoundingClientRect();
        return {
          innerTop: outer.top + border,
          innerWidth: outer.width - 2 * border,
          innerHeight: outer.height - 2 * border,
          photo: { top: photo.top, width: photo.width, height: photo.height },
        };
      });
      heights.set(width, box.innerHeight);

      // Assert — the frame's shape, full width, from the top: scaled and placed
      // exactly as the crop window places it.
      expect(
        Math.abs(box.photo.width / box.photo.height - FRAME_ASPECT),
        `${width}px: the photograph is ${box.photo.width}x${box.photo.height}, not the frame's shape`,
      ).toBeLessThan(0.01);
      expect(Math.abs(box.photo.width - box.innerWidth), `${width}px: the photograph is not full width`).toBeLessThan(1);
      expect(Math.abs(box.photo.top - box.innerTop), `${width}px: the photograph is not at the top`).toBeLessThan(1);
      // Never shorter than the lit 70% — past it the window is solid ink too.
      expect(
        box.innerHeight,
        `${width}px: the card cuts into the lit part of the frame`,
      ).toBeGreaterThanOrEqual(box.photo.height * LIT_SHARE - 0.5);
    }

    // And every phone draws the card at one height — the content's — so the
    // list keeps three cards and the start of a fourth on screen.
    for (const width of [360, 430] as const) {
      expect(Math.abs(heights.get(width)! - heights.get(390)!), `the card at ${width}px is not the phone's height`).toBeLessThan(
        0.5,
      );
    }
    expect(heights.get(1280)!, "on a laptop the card did not grow to the frame's lit part").toBeGreaterThan(
      heights.get(390)! + 20,
    );
  } finally {
    await destroyScratchGame(game.id);
  }
});

/** Mean of a few pixels at a fraction of an element's height, from a fresh capture. */
async function lumaAt(page: Page, selector: string, fy: number): Promise<number> {
  const box = (await page.locator(selector).boundingBox())!;
  const png = PNG.sync.read(
    await page.screenshot({
      clip: { x: box.x + box.width / 2 - 3, y: box.y + box.height * fy - 3, width: 6, height: 6 },
    }),
  );
  let sum = 0;
  for (let i = 0; i < png.data.length; i += 4) sum += (png.data[i]! + png.data[i + 1]! + png.data[i + 2]!) / 3;
  return sum / (png.data.length / 4);
}

test("the venue photo's crop window darkens as the card does, so the outline shows what the card will", async ({
  page,
  context,
}) => {
  // Arrange — the scratch venue the specs share; the crop is CANCELLED, so
  // its photo (none) is left as it was.
  const { data: venue } = await serviceClient().from("venues").select("id").eq("name", "E2E Scratch Pitch").single();
  await signInAs(context, players.organizer);
  await context.addCookies([{ name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" }]);
  await page.goto("/admin/venues", { waitUntil: "networkidle" });
  const row = page.locator(`[data-testid="venue-row"][data-venue-id="${venue!.id}"]`);
  await row.locator("summary").click();

  // Act — a solid yellow photograph, picked and left in the window.
  const input = row.locator('[data-testid="venue-photo-input"]');
  await expect(async () => {
    await input.setInputFiles({ name: "solid.png", mimeType: "image/png", buffer: await solidImage(page, YELLOW) });
    await expect(page.getByTestId("photo-cropper-frame")).toBeVisible({ timeout: 2000 });
  }).toPass();
  await expect
    .poll(() => page.getByTestId("photo-cropper-frame").locator("img").evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);

  try {
    // Assert — the card's own two layers are over the window…
    const overlay = page.getByTestId("photo-cropper-overlay");
    await expect(overlay.getByTestId("card-scrim")).toBeAttached();
    await expect(overlay.getByTestId("card-title-scrim")).toBeAttached();
    await expect(page.getByTestId("photo-cropper")).toContainText("keep the pitch in the light part");

    // …and they paint: light where the card's photograph shows, ink where its
    // faces and its bar sit. Yellow at full brightness is 170.
    const frame = '[data-testid="photo-cropper-frame"]';
    expect(await lumaAt(page, frame, 0.4), "the window is dark where the card shows the photo").toBeGreaterThan(90);
    expect(await lumaAt(page, frame, 0.85), "the window is bright where the card is ink").toBeLessThan(30);
  } finally {
    await page.getByTestId("photo-cropper-cancel").click();
  }
});
