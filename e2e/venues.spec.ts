import { expect, test } from "@playwright/test";
import { players, serviceClient, signInAs } from "./helpers/session";

/**
 * ROUND 13 ITEM 24 — the venue management page.
 *
 * THE HEIGHT ASSERTION IS THE POINT OF THE FIRST TEST. This page first shipped
 * with every venue expanded, on the reasoning that there are "a handful of
 * grounds". There are eleven, each carrying a form, a photo control and a
 * ten-box amenity grid, and the page measured THIRTY-TWO THOUSAND PIXELS. A
 * screenshot caught it an hour later; a number keeps it caught.
 */

test.use({ viewport: { width: 390, height: 844 } });

test("every venue is listed, closed, and the page stays a readable length", async ({
  page,
  context,
}) => {
  await signInAs(context, players.organizer);
  await page.goto("/admin/venues", { waitUntil: "networkidle" });

  const rows = page.getByTestId("venue-row");
  expect(await rows.count(), "no venues listed at all").toBeGreaterThan(0);

  // Closed by default: the controls inside exist in the DOM (`<details>` keeps
  // them) but are not rendered, so the row is a summary's height.
  const firstRow = rows.first();
  await expect(firstRow.getByTestId("venue-summary")).toBeVisible();
  await expect(firstRow.getByTestId("venue-save")).toBeHidden();

  /*
   * A BOUND, NOT AN EXACT FIGURE. It scales with however many venues the seed
   * holds, and what it forbids is the failure that happened: a page whose
   * height is a multiple of a form rather than of a row.
   */
  const perVenue = await page.evaluate(() => document.body.scrollHeight);
  const count = await rows.count();
  expect(
    perVenue / count,
    `the venue list is ${Math.round(perVenue / count)}px per venue`,
  ).toBeLessThan(600);
});

test("opening a venue reveals its fields and its inherited presets", async ({
  page,
  context,
}) => {
  await signInAs(context, players.organizer);
  await page.goto("/admin/venues", { waitUntil: "networkidle" });

  const row = page.getByTestId("venue-row").first();
  await row.getByTestId("venue-summary").click();

  await expect(row.getByTestId("venue-name-input")).toBeVisible();
  await expect(row.getByTestId("venue-map-input")).toBeVisible();
  await expect(row.getByTestId("venue-pitch-input")).toBeVisible();
  await expect(row.getByTestId("venue-save")).toBeVisible();
});

test("an admin renames a venue, and games already played keep their name", async ({
  page,
  context,
}) => {
  await signInAs(context, players.organizer);
  const admin = serviceClient();

  const { data: venue } = await admin
    .from("venues")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  const original = venue!.name;
  const renamed = `${original} RENAMED`;

  try {
    await page.goto("/admin/venues", { waitUntil: "networkidle" });
    const row = page.locator(`[data-venue-id="${venue!.id}"]`);
    await row.getByTestId("venue-summary").click();
    await row.getByTestId("venue-name-input").fill(renamed);
    await row.getByTestId("venue-save").click();
    await expect(row.getByTestId("venue-saved")).toBeVisible();

    const { data: after } = await admin
      .from("venues")
      .select("name")
      .eq("id", venue!.id)
      .single();
    expect(after?.name).toBe(renamed);

    /*
     * AND NO GAME'S RECORDED VENUE MOVED. `games.venue` is a SNAPSHOT taken at
     * creation and deliberately not a foreign key to this text, so a rename
     * changes what future games are called and leaves history alone. That is
     * the property that makes renaming safe at all, and it is the one nobody
     * would notice breaking until a settled game started reading differently.
     */
    const { data: games } = await admin
      .from("games")
      .select("venue")
      .eq("venue_id", venue!.id)
      .limit(20);
    for (const game of games ?? []) {
      expect(game.venue, "a rename rewrote a game's recorded venue").not.toBe(renamed);
    }
  } finally {
    await admin.rpc("admin_update_venue", { p_venue_id: venue!.id, p_name: original });
  }
});
