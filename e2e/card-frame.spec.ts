import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { players, serviceClient, signInAs } from "./helpers/session";
import { YELLOW, solidImage } from "./helpers/solidPhoto";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold";
import { VENUE_WIDE_BAND, VENUE_WIDE_CARD } from "../lib/storage/avatar";

/**
 * THE VENUE PHOTO'S CROP WINDOW SHOWS BOTH CARDS (2026-11-16): the phone's
 * (the whole frame, shaded as the card shades it) and the computer's (the
 * dashed band). The owner wants to "crop it to fit the outline, and for it to
 * show up the same exact way on the game card", and "it's somehow gotta look
 * good on both". (The card's frame-shaped photo box went out the
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
    await expect(page.getByTestId("photo-cropper")).toContainText("the dashed band is what a computer shows");

    // …and they paint as the card does: light in the middle, and SHADED — not
    // black — at the foot, where the card's faces and bar sit (the owner chose
    // the lighter foot, 2026-11-16). Yellow at full brightness is 170.
    const frame = '[data-testid="photo-cropper-frame"]';
    expect(await lumaAt(page, frame, 0.4), "the window is dark where the card shows the photo").toBeGreaterThan(90);
    const foot = await lumaAt(page, frame, 0.85);
    expect(foot, "the window's foot is not shaded").toBeLessThan(90);
    expect(foot, "the window's foot is black — the photo should still show there").toBeGreaterThan(35);

    // And the computer's band, centred, the share of the frame the card on a
    // computer keeps.
    const geometry = await page.evaluate(() => {
      const f = document.querySelector('[data-testid="photo-cropper-frame"]')!.getBoundingClientRect();
      const b = document.querySelector('[data-testid="photo-cropper-overlay"] [data-testid="computer-band"]')!.getBoundingClientRect();
      return { top: (b.top - f.top) / f.height, height: b.height / f.height };
    });
    expect(Math.abs(geometry.height - VENUE_WIDE_BAND), "the band is not the computer card's share").toBeLessThan(0.01);
    expect(Math.abs(geometry.top - (1 - geometry.height) / 2), "the band is not centred").toBeLessThan(0.01);
  } finally {
    await page.getByTestId("photo-cropper-cancel").click();
  }
});

test("the computer card is the shape the crop window's band is drawn for", async ({ page }) => {
  // Arrange — the band is computed from a MEASURED card; this keeps the
  // measurement honest if the list's width or the card's content moves.
  const game = await createScratchGame({ hoursFromNow: 48, format: "6v6" });
  try {
    for (const width of [1024, 1280, 1920] as const) {
      await page.setViewportSize({ width, height: 900 });

      // Act
      await page.goto("/games", { waitUntil: "networkidle" });
      const card = page.locator(`[data-testid="game-row"][data-game-id="${game.id}"]`);
      await card.scrollIntoViewIfNeeded();
      const inner = await card.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const border = parseFloat(getComputedStyle(el).borderTopWidth);
        return { width: r.width - 2 * border, height: r.height - 2 * border };
      });

      // Assert
      const aspect = inner.width / inner.height;
      const constant = VENUE_WIDE_CARD.width / VENUE_WIDE_CARD.height;
      expect(
        Math.abs(aspect - constant) / constant,
        `${width}px: the card is ${inner.width}x${inner.height}, and the window's band is drawn for ` +
          `${VENUE_WIDE_CARD.width}x${VENUE_WIDE_CARD.height}`,
      ).toBeLessThan(0.02);
    }
  } finally {
    await destroyScratchGame(game.id);
  }
});
