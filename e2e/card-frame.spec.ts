import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { players, serviceClient, signInAs } from "./helpers/session";
import { YELLOW, solidImage } from "./helpers/solidPhoto";

/**
 * THE VENUE PHOTO'S CROP WINDOW DARKENS AS THE CARD DOES (2026-11-16): the
 * owner wants to "crop it to fit the outline, and for it to show up the same
 * exact way on the game card". (The card's frame-shaped photo box went out the
 * same day and came back the same day — the owner: "phone shows up incorrectly
 * now. please fix to how it was before". Ledger row 469.)
 */
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
