import { expect, test } from "@playwright/test";
import { players, serviceClient, signInAs } from "./helpers/session.ts";

/**
 * THERE IS NO DRAFT STEP ANY MORE (round 9, item 7).
 *
 * Creating a game publishes it (round 8, item 6), so a draft is either one made
 * before that change or one whose publish call failed. Neither is a fixture on
 * the board — so drafts left the games list, and surface instead as UNFINISHED
 * WORK on the page where somebody about to create a game is standing.
 *
 * THE DATA MODEL IS UNTOUCHED. `game_status` still has `draft`, `publish_game`
 * still exists and still emits its event, and every existing draft is still
 * openable, publishable and cancellable. Only the surfaces and the flow moved,
 * which is what makes this reversible without a migration.
 */
test.use({ viewport: { width: 390, height: 844 } });

test("drafts are gone from the games list and listed as unfinished instead", async ({
  page,
  context,
}) => {
  const admin = serviceClient();
  const { data: drafts } = await admin
    .from("games")
    .select("id,venue")
    .eq("status", "draft");

  test.skip(
    !drafts || drafts.length === 0,
    "no draft in the seed — nothing to place",
  );

  await signInAs(context, players.organizer);

  // --- gone from the list -------------------------------------------------
  await page.goto("/admin/games", { waitUntil: "networkidle" });
  const statuses = await page
    .locator("[data-status]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-status")));
  expect(statuses.length, "the games list is empty").toBeGreaterThan(0);
  expect(statuses, "a draft is still in the games list").not.toContain("draft");

  // --- and present where the work is ---------------------------------------
  await page.goto("/admin/games/new", { waitUntil: "networkidle" });
  const rows = page.getByTestId("unfinished-game");
  await expect(rows).toHaveCount(drafts!.length);

  /*
   * OPENING ONE LANDS ON A PREFILLED FORM WITH BOTH EXITS. The item asks for
   * "open one to prefill the form, then publish or delete it" — the game page
   * already does all three, so nothing is rebuilt here. Asserted because the
   * list would look right while linking somewhere useless.
   */
  await rows.first().click();
  await page.waitForURL(/\/admin\/games\/[0-9a-f-]{36}/);
  await expect(page.getByTestId("publish-game")).toBeVisible();
  await expect(page.getByTestId("game-form-submit")).toBeVisible();
  expect(
    await page.getByTestId("venue-select").inputValue(),
    "the edit form opened blank instead of prefilled",
  ).not.toBe("");
});

/**
 * AND THE LIST DISAPPEARS WHEN THERE IS NOTHING UNFINISHED — which is the
 * normal state now, and the state it exists to reach. A permanent "no
 * unfinished games" panel would be furniture advertising a condition that no
 * longer occurs.
 */
test("the unfinished list is absent when every game is published", async ({
  page,
  context,
}) => {
  const admin = serviceClient();
  const { data: drafts } = await admin.from("games").select("id").eq("status", "draft");
  test.skip((drafts?.length ?? 0) > 0, "the seed holds a draft, which is its job");

  await signInAs(context, players.organizer);
  await page.goto("/admin/games/new", { waitUntil: "networkidle" });
  await expect(page.getByTestId("unfinished-games")).toHaveCount(0);
});
