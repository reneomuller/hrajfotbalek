import { expect, test, type Locator, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { pragueDayKey } from "../lib/games/days";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session";

/**
 * ROUND 41 — "Venue picture doesn't update when changing it or the change
 * doesn't register."
 *
 * It registered. Production showed three venue objects re-uploaded on
 * 2026-10-27, each `updated_at` moved — and every page went on showing the old
 * photograph, because `set_venue_photo` writes the SAME key and the URL carried
 * no version, so the browser, the storage CDN and the optimizer (which keeps an
 * image for a year) all answered with the bytes they already had.
 *
 * DECODED, NOT INFERRED FROM `src`: a new query string proves a new URL, not a
 * new picture. Each surface is screenshotted in memory and its centre must be
 * the colour of the SECOND upload. Solid colours, so the crop cannot matter.
 */

test.use({ viewport: { width: 390, height: 844 } });

const MAGENTA = [255, 0, 255] as const;
const YELLOW = [255, 255, 0] as const;

async function solidImage(page: Page, rgb: readonly number[]): Promise<Buffer> {
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

/** The average colour of the middle of an element, read from a fresh capture. */
async function centreColour(page: Page, target: Locator): Promise<number[]> {
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
function isColour(actual: number[], expected: readonly number[]): boolean {
  const [r, g, b] = actual as [number, number, number];
  return expected === MAGENTA ? r > g + 40 && b > g + 40 : r > b + 40 && g > b + 40;
}

async function uploadVenuePhoto(page: Page, row: Locator, image: Buffer): Promise<void> {
  await row.locator('[data-testid="venue-photo-input"]').setInputFiles({
    name: "solid.png",
    mimeType: "image/png",
    buffer: image,
  });
  await expect(page.getByTestId("photo-cropper-frame")).toBeVisible();
  await page.getByTestId("photo-cropper-save").click();
  await expect(page.getByTestId("photo-cropper")).toBeHidden();
}

test("a replaced venue photo shows on the admin row, the games list and the game page", async ({
  page,
  context,
}) => {
  test.slow();

  // Arrange
  const admin = serviceClient();
  const organizer = await apiClientFor(players.organizer);
  let venueId: string | null = null;
  let gameId: string | null = null;

  try {
    const venue = await admin.rpc("admin_create_venue", {
      p_name: `E2E Photo Replace ${Date.now()}`,
      p_image_path: null,
      p_map_query: null,
    });
    if (venue.error) throw new Error(`admin_create_venue: ${venue.error.message}`);
    venueId = venue.data as string;

    const startsAt = new Date(Date.now() + 24 * 27 * 3600_000).toISOString();
    const game = await organizer.rpc("admin_create_game_v2", {
      p_venue_id: venueId,
      p_starts_at: startsAt,
      p_capacity: 12,
      p_price_czk: 180,
      p_organizer_name: "E2E Organizer",
      p_format: null,
      p_surface: null,
      p_notes: null,
      p_organizer_phone: null,
      p_duration_minutes: 90,
      p_allowed_skill_levels: null,
      p_subs_per_team: null,
    });
    if (game.error) throw new Error(`admin_create_game_v2: ${game.error.message}`);
    gameId = game.data as string;
    const published = await organizer.rpc("publish_game", { p_game_id: gameId });
    if (published.error) throw new Error(`publish_game: ${published.error.message}`);

    await signInAs(context, players.organizer);
    await context.addCookies([{ name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" }]);

    await page.goto("/admin/venues", { waitUntil: "networkidle" });
    const row = page.locator(`[data-testid="venue-row"][data-venue-id="${venueId}"]`);
    await row.locator("summary").click();
    await uploadVenuePhoto(page, row, await solidImage(page, MAGENTA));
    const preview = row.getByTestId("venue-photo-preview");
    await expect.poll(() => centreColour(page, preview).then((c) => isColour(c, MAGENTA))).toBe(true);

    // The player-facing pages load the FIRST photo, so it is in their caches.
    const card = page
      .locator(`[data-testid="game-row"][data-game-id="${gameId}"] [data-testid="card-photo"]`)
      .first();
    await page.goto(`/games?day=${pragueDayKey(startsAt)}`);
    await expect.poll(() => centreColour(page, card).then((c) => isColour(c, MAGENTA))).toBe(true);
    const firstSrc = await card.getAttribute("src");

    // Act
    await page.goto("/admin/venues", { waitUntil: "networkidle" });
    await row.locator("summary").click();
    await uploadVenuePhoto(page, row, await solidImage(page, YELLOW));

    // Assert — the admin row, without a reload.
    await expect
      .poll(() => centreColour(page, preview).then((c) => isColour(c, YELLOW)), {
        message: "the admin preview still shows the first photo",
      })
      .toBe(true);

    // The games list, which already held the first photo.
    await page.goto(`/games?day=${pragueDayKey(startsAt)}`);
    await expect
      .poll(() => centreColour(page, card).then((c) => isColour(c, YELLOW)), {
        message: "the games list still shows the first photo",
      })
      .toBe(true);
    expect(await card.getAttribute("src")).not.toBe(firstSrc);

    // The game page.
    await page.goto(`/game/${gameId}`);
    await expect
      .poll(() => centreColour(page, page.getByTestId("hero-photo")).then((c) => isColour(c, YELLOW)), {
        message: "the game page still shows the first photo",
      })
      .toBe(true);
  } finally {
    if (gameId) {
      await admin.from("events").delete().eq("game_id", gameId);
      await admin.from("game_organizer_contacts").delete().eq("game_id", gameId);
      await admin.from("games").delete().eq("id", gameId);
    }
    if (venueId) {
      await admin.storage.from("venue-photos").remove([`venues/${venueId}.webp`]);
      await admin.from("venues").delete().eq("id", venueId);
    }
  }
});
