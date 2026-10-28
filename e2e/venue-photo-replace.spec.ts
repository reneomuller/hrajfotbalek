import { expect, test, type Locator, type Page } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { pragueDayKey } from "../lib/games/days";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session";
import {
  centreColour,
  isColour,
  MAGENTA,
  solidImage,
  uploadThroughCropper,
  YELLOW,
} from "./helpers/solidPhoto";

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
 * DECODED, NOT INFERRED FROM `src` (`helpers/solidPhoto.ts`): each surface is
 * screenshotted in memory and its centre must be the colour of the SECOND
 * upload.
 */

test.use({ viewport: { width: 390, height: 844 } });

async function uploadVenuePhoto(page: Page, row: Locator, image: Buffer): Promise<void> {
  await uploadThroughCropper(page, row.locator('[data-testid="venue-photo-input"]'), image);
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
