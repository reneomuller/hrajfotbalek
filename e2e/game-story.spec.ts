import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";
import { players, serviceClient, signInAs } from "./helpers/session";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold";

/**
 * ROUND 42 — a game's 9:16 story image, downloaded by an admin.
 *
 * The owner: "while creating a game or from the game card itself, it would be
 * great if admins could download an image in 9:16 (1080x1920) of the game".
 * What the image SAYS is unit-tested (`lib/og/__tests__/`); this is the
 * download — who gets it, and that it is a 1080×1920 PNG.
 */

test("an admin downloads the story from the game's admin page — a 1080×1920 PNG", async ({
  page,
  context,
}) => {
  // Arrange
  const game = await createScratchGame({ hoursFromNow: 24 * 3 });
  try {
    await signInAs(context, players.organizer);
    await page.goto(`/admin/games/${game.id}`, { waitUntil: "networkidle" });

    // Act
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("story-download").click(),
    ]);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);

    // Assert
    expect(download.suggestedFilename()).toMatch(/^hraj-fotbal-.+-story\.png$/);
    const png = PNG.sync.read(Buffer.concat(chunks));
    expect({ width: png.width, height: png.height }).toEqual({ width: 1080, height: 1920 });
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("a player or a visitor gets no story, only the way out", async ({ request, context, page }) => {
  // Arrange
  const game = await createScratchGame({ hoursFromNow: 24 * 3 });
  try {
    // Act + Assert — signed out: sent to sign in, never an image.
    const anonymous = await request.get(`/admin/games/${game.id}/story`, { maxRedirects: 0 });
    expect(anonymous.headers()["content-type"] ?? "").not.toContain("image/png");

    // A signed-in player: sent home, never an image.
    await signInAs(context, players.runner);
    const response = await page.goto(`/admin/games/${game.id}/story`);
    expect(response?.headers()["content-type"] ?? "").not.toContain("image/png");
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("an admin gives a venue its address on the venue page", async ({ page, context }) => {
  // Arrange
  const admin = serviceClient();
  const venue = (await admin.from("venues").select("id, address").limit(1).single()).data as {
    id: string;
    address: string | null;
  };
  try {
    await signInAs(context, players.organizer);
    await page.goto("/admin/venues", { waitUntil: "networkidle" });
    const row = page.locator(`[data-testid="venue-row"][data-venue-id="${venue.id}"]`);
    const form = row.getByTestId("venue-edit-form");

    // Act — open the venue's row, then save, retrying a submit that lands
    // before hydration.
    await expect(async () => {
      if (!(await form.isVisible())) await row.locator("summary").click();
      await form.getByTestId("venue-address-input").fill("Dubečská 9, Praha 10");
      await form.locator('button[type="submit"]').first().click();
      const { data } = await admin.from("venues").select("address").eq("id", venue.id).single();
      expect((data as { address: string | null }).address).toBe("Dubečská 9, Praha 10");
    }).toPass({ timeout: 20_000 });
  } finally {
    await admin.rpc("set_venue_address", { p_venue_id: venue.id, p_address: venue.address });
  }
});
