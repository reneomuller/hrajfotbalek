import { expect, test } from "@playwright/test";
import { players, serviceClient, signInAs } from "./helpers/session.ts";

/**
 * ~~"drafts are gone from the games list and listed as unfinished instead"
 * (round 9, item 7).~~ REPLACED IN ROUND 14 ITEM 1: THE CONCEPT IS DEAD.
 *
 * There is one path — create a game and it is published. The "Unfinished
 * games" list is gone, the Publish button is gone, and the "not public yet"
 * notice with them. Round 9 kept those so pre-existing drafts stayed
 * reachable; round 14 hands the owner a deletion script instead
 * (`docs/ops/delete-draft-games.sql`), which is the honest way to end a
 * concept rather than leaving a vestigial surface for rows nobody can create.
 *
 * THE DATA MODEL IS STILL UNTOUCHED. `game_status` keeps `draft` and
 * `publish_game` still exists and still emits its event — it is the only way
 * to put a stranded draft on the board, and deleting a repair because its
 * button went is the mistake `merge_players` is a standing note about. What
 * this file asserts is that no SURFACE offers the concept any more.
 */
test.use({ viewport: { width: 390, height: 844 } });

test("no surface offers the draft concept", async ({ page, context }) => {
  await signInAs(context, players.organizer);

  // The create page: no unfinished list, whatever the database holds.
  await page.goto("/admin/games/new", { waitUntil: "networkidle" });
  await expect(page.getByTestId("unfinished-games")).toHaveCount(0);
  await expect(page.getByTestId("unfinished-game")).toHaveCount(0);

  // And no Publish button on a game surface — asserted on a DRAFT if the seed
  // has one, because that is the only row where the button could ever render.
  const admin = serviceClient();
  const { data: drafts } = await admin
    .from("games")
    .select("id")
    .eq("status", "draft")
    .limit(1);

  const target = drafts?.[0]?.id;
  test.skip(!target, "no draft row to check the button against");

  await page.goto(`/admin/games/${target}`, { waitUntil: "networkidle" });
  await expect(page.getByTestId("publish-game")).toHaveCount(0);
});

/**
 * CREATING A GAME PUBLISHES IT. The property the single path rests on, and the
 * one that would strand rows again if it regressed.
 */
test("a game created through the form is published, not drafted", async ({ page, context }) => {
  await signInAs(context, players.organizer);
  const admin = serviceClient();

  const venue = (await admin.from("venues").select("id, name").limit(1).single()).data!;
  const when = new Date(Date.now() + 40 * 24 * 3600 * 1000).toISOString().slice(0, 16);

  await page.goto("/admin/games/new", { waitUntil: "networkidle" });
  await page.getByTestId("venue-select").selectOption(venue.id);
  await page.getByTestId("starts-at").fill(when);
  await page.getByTestId("organizer-name").fill("R14 Organizer");
  await page.getByTestId("game-form-submit").click();

  await page.waitForURL(/\/admin\/games\/[0-9a-f-]{36}/, { timeout: 20000 });
  const id = page.url().split("/").pop()!;

  try {
    const { data: game } = await admin.from("games").select("status").eq("id", id).single();
    expect(game?.status, "a game created through the form is a draft again").toBe("published");
  } finally {
    await admin.from("games").delete().eq("id", id);
  }
});
