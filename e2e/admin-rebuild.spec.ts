import { expect, test, type Page } from "@playwright/test";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session";

/**
 * ROUND 42, THE ADMIN REBUILD — what the rebuild added that no older spec
 * drives.
 *
 * The owner: "update the design of all the pages in admin. all of them", and
 * the pitch cost: "two values, one for summer and another for winter, with a
 * simple toggle". Every older admin spec still runs against the rebuilt pages
 * and passes; these cover the two things that are new:
 *
 *   * EVERY ADMIN PAGE FITS A PHONE. The first full run found the dashboard
 *     2px wider than 390 — a grid with no column template sizes its one track
 *     to its widest row — and nothing would ever have failed on it.
 *   * THE PITCH COST, end to end: the season switch, a venue's two prices, and
 *     one game's correction. Each test puts back what it changed: the season
 *     and the scratch venue are shared by every later spec.
 */

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ context }) => {
  await signInAs(context, players.organizer);
});

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function costOf(gameId: string): Promise<{ cost: number; byHand: boolean } | null> {
  const { data } = await serviceClient()
    .from("game_pitch_costs")
    .select("cost_czk, set_by_hand")
    .eq("game_id", gameId)
    .maybeSingle();
  return data ? { cost: data.cost_czk as number, byHand: data.set_by_hand as boolean } : null;
}

async function seasonNow(): Promise<"summer" | "winter"> {
  const { data } = await serviceClient().from("pitch_settings").select("season").eq("id", "singleton").single();
  return data!.season as "summer" | "winter";
}

async function venueCosts(venueId: string): Promise<{ summer: number; winter: number }> {
  const { data } = await serviceClient()
    .from("venue_pitch_costs")
    .select("summer_czk, winter_czk")
    .eq("venue_id", venueId)
    .single();
  return { summer: data!.summer_czk as number, winter: data!.winter_czk as number };
}

async function venueOf(gameId: string): Promise<string> {
  const { data } = await serviceClient().from("games").select("venue_id").eq("id", gameId).single();
  return data!.venue_id as string;
}

test("every rebuilt admin page fits a 390px phone", async ({ page }) => {
  // Arrange
  const game = await createScratchGame({ durationMinutes: 90 });
  const { data: me } = await serviceClient()
    .from("players")
    .select("id")
    .eq("email", players.organizer.email)
    .single();
  const paths = [
    "/admin",
    "/admin/games",
    "/admin/games?tab=played",
    "/admin/games?tab=cancelled",
    `/admin/games/${game.id}`,
    "/admin/games/new",
    "/admin/players",
    "/admin/players?segment=shadow",
    `/admin/players/${me!.id}`,
    "/admin/stats",
    "/admin/venues",
    "/admin/site",
  ];

  try {
    for (const path of paths) {
      // Act
      await page.goto(path);
      // The real page, not a loading boundary: every admin page titles itself.
      await expect(page.locator("main h2").first(), path).toBeVisible();

      // Assert
      expect(await horizontalOverflow(page), `${path} scrolls sideways`).toBeLessThanOrEqual(0);
    }
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("the season switch prices the games created after it, and leaves the earlier ones alone", async ({
  page,
}) => {
  // Arrange
  const original = await seasonNow();
  const other = original === "winter" ? "summer" : "winter";
  const before = await createScratchGame({ durationMinutes: 90 });
  const venueId = await venueOf(before.id);
  const prices = await venueCosts(venueId);
  let after: { id: string } | null = null;

  try {
    // Act
    await page.goto("/admin/venues");
    await page.getByTestId(`pitch-season-${other}`).click();
    await expect.poll(seasonNow, { message: "the switch reaches the database" }).toBe(other);
    after = await createScratchGame({ durationMinutes: 90 });

    // Assert
    expect((await costOf(after.id))?.cost, "a new game takes the new season's price").toBe(prices[other]);
    expect((await costOf(before.id))?.cost, "an existing game keeps its own").toBe(prices[original]);
  } finally {
    await (await apiClientFor(players.organizer)).rpc("set_pitch_season", { p_season: original });
    await destroyScratchGame(before.id);
    if (after) await destroyScratchGame(after.id);
  }
});

test("a venue's summer and winter prices save from its card", async ({ page }) => {
  // Arrange
  const game = await createScratchGame({ durationMinutes: 90 });
  const venueId = await venueOf(game.id);
  const original = await venueCosts(venueId);
  const wanted = { summer: original.summer + 50, winter: original.winter + 70 };

  try {
    // Act
    await page.goto("/admin/venues");
    const card = page.locator(`[data-testid='venue-row'][data-venue-id='${venueId}']`);
    await card.getByTestId("venue-summary").click();
    await card.getByTestId("venue-pitch-cost-input-summer").fill(String(wanted.summer));
    await card.getByTestId("venue-pitch-cost-input-winter").fill(String(wanted.winter));
    await card.getByTestId("venue-pitch-cost-save").click();

    // Assert — on the database, which a re-render cannot unmount.
    await expect.poll(() => venueCosts(venueId), { message: "both prices stored" }).toEqual(wanted);
  } finally {
    await (await apiClientFor(players.organizer)).rpc("set_venue_pitch_costs", {
      p_venue_id: venueId,
      p_summer_czk: original.summer,
      p_winter_czk: original.winter,
    });
    await destroyScratchGame(game.id);
  }
});

test("one game's pitch cost is corrected by hand, and an empty box puts it back", async ({ page }) => {
  // Arrange
  const game = await createScratchGame({ durationMinutes: 90 });
  const fromVenue = (await costOf(game.id))!.cost;
  const corrected = fromVenue + 150;

  try {
    await page.goto(`/admin/games/${game.id}`);
    await expect(page.getByTestId("game-money")).toBeVisible();
    await expect(page.getByTestId("pitch-cost-source")).toHaveAttribute("data-set-by-hand", "false");

    // Act — correct it
    await page.getByTestId("pitch-cost-input").fill(String(corrected));
    await page.getByTestId("pitch-cost-save").click();

    // Assert
    await expect.poll(() => costOf(game.id)).toEqual({ cost: corrected, byHand: true });
    await expect(page.getByTestId("pitch-cost-source")).toHaveAttribute("data-set-by-hand", "true");

    // Act — clear it
    await page.getByTestId("pitch-cost-input").fill("");
    await page.getByTestId("pitch-cost-save").click();

    // Assert
    await expect.poll(() => costOf(game.id)).toEqual({ cost: fromVenue, byHand: false });
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * The owner, 2026-11-08: "in the players admin tab, please have the player
 * country graph and their skill level graph above the long player list". It
 * was above on a desktop and below on a phone; now above at both widths.
 */
for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
]) {
  test(`the country and skill graphs sit above the players list at ${viewport.width}px`, async ({ page }) => {
    // Arrange
    await page.setViewportSize(viewport);

    // Act
    await page.goto("/admin/players");
    const list = page.getByTestId("players-list");
    await expect(list).toBeVisible();

    // Assert
    const listTop = (await list.boundingBox())!.y;
    for (const graph of ["players-by-country", "players-by-skill"]) {
      const box = (await page.getByTestId(graph).boundingBox())!;
      expect(box.y + box.height, `${graph} ends above the list`).toBeLessThanOrEqual(listTop);
    }
  });
}

/*
 * The owner, 2026-11-08: "revenue should count all the revenue including game
 * pass … one box with total and the other with the split of the two … instead
 * of 'outstanding' … the two revenue boxes the two on top and the other two
 * boxes (avg per game and games settled) as the bottom two".
 */
test("the money page leads with revenue and its split, then the average and the games played", async ({ page }) => {
  // Act
  await page.goto("/admin/stats");
  await expect(page.getByTestId("financials-revenue")).toBeVisible();

  // Assert — two by two, in that order, and no Outstanding box.
  const [revenue, split, average, played] = await Promise.all(
    ["financials-revenue", "financials-revenue-split", "financials-average", "financials-settled"].map(
      async (id) => (await page.getByTestId(id).boundingBox())!,
    ),
  );
  expect(Math.abs(revenue!.y - split!.y), "the two revenue boxes share the top row").toBeLessThan(1);
  expect(Math.abs(average!.y - played!.y), "average and games played share the next").toBeLessThan(1);
  expect(average!.y).toBeGreaterThan(revenue!.y + revenue!.height - 1);
  expect(revenue!.x).toBeLessThan(split!.x);
  expect(average!.x).toBeLessThan(played!.x);
  await expect(page.getByTestId("revenue-split-games")).toBeVisible();
  await expect(page.getByTestId("revenue-split-pass")).toBeVisible();
  await expect(page.getByTestId("financials-outstanding")).toHaveCount(0);
});

test("the games list sorts by date, venue and fill — no Unpaid, no Status", async ({ page }) => {
  // Act
  await page.goto("/admin/games");

  // Assert
  await expect(page.getByTestId("games-sort-date")).toBeVisible();
  await expect(page.getByTestId("games-sort-venue")).toBeVisible();
  await expect(page.getByTestId("games-sort-filled")).toBeVisible();
  await expect(page.getByTestId("games-sort-unpaid")).toHaveCount(0);
  await expect(page.getByTestId("games-sort-status")).toHaveCount(0);
});
