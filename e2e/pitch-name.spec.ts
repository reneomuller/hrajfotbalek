import { expect, test } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { players, serviceClient, signInAs } from "./helpers/session.ts";

/**
 * THE PITCH NAME — REVERSED AS A FEATURE, KEPT AS DATA (round 16, item 20).
 *
 * ~~The whole feature was a loop and was asserted as one: a name typed into
 * the game form is stored on the GAME, renders on the detail joined to the
 * venue, and comes back as a suggestion the next time the form is opened.~~
 *
 * THE PREMISE MOVED, WHICH IS WHY THE RULING DID (R31). Per-game pitch names
 * were added when a game named its own ground as free text and venues were
 * barely an entity. Round 13 gave `venues` a `pitch_name`, round 14 made a
 * game INHERIT its venue — and at that point the form's box was a second place
 * to say a thing the venue already said, on the screen where somebody is least
 * likely to know the ground's real name.
 *
 * SO THIS FILE SPLITS IN TWO, and the split is the point:
 *
 *   1. THE FIELD IS GONE, asserted by inversion so it cannot come back.
 *   2. THE DATA STILL RENDERS. `games.pitch_name` is untouched and live
 *      fixtures carry values; deleting the display to tidy a form would blank
 *      a name on a real game. This is the assertion that keeps the removal
 *      honest — a reversal that quietly took the data with it would pass a
 *      test that only checked the form.
 */
test.use({ viewport: { width: 390, height: 844 } });

test("the game form no longer offers a pitch name", async ({ page, context }) => {
  await signInAs(context, players.organizer);
  await page.goto("/admin/games/new", { waitUntil: "networkidle" });

  await expect(page.getByTestId("pitch-name")).toHaveCount(0);
  await expect(page.getByTestId("pitch-name-options")).toHaveCount(0);

  /*
   * AND NOT UNDER ANOTHER NAME. The testid could be renamed and the box kept;
   * what the item removed is the ABILITY to set one per game, so the check is
   * that no control on the form is labelled for it.
   */
  const labels = await page.locator("main label").allInnerTexts();
  expect(
    labels.join(" ").toLowerCase(),
    "the form still asks for a pitch name",
  ).not.toContain("pitch name");
});

test("a game that already carries a pitch name still renders it", async ({
  page,
  context,
}) => {
  const admin = serviceClient();
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);

  /*
   * Written straight to the row, which is exactly the situation the removal
   * leaves behind: rows set before round 16 that nothing in the UI can create
   * any more and everything must still display.
   */
  const { data: game } = await admin
    .from("games")
    .select("id, pitch_name")
    .eq("status", "published")
    .limit(1)
    .single();
  expect(game, "no published game to check against").toBeTruthy();

  const previous = game!.pitch_name;
  await admin.from("games").update({ pitch_name: "Legacy Pitch 3" }).eq("id", game!.id);

  try {
    await page.goto(`/game/${game!.id}`, { waitUntil: "networkidle" });

    /*
     * IN THE HERO, NOT THE FACT CARD (round 18, item 3).
     *
     * The card's Where row became Language, and the swap was defensible
     * precisely because `GameHero` is already passed
     * `venueDisplayName(venue, pitchName)` — the same string, pitch name and
     * all. This test is what makes that claim checkable rather than asserted
     * in a comment: if the hero ever stops carrying the pitch name, the row
     * that used to is no longer there to cover for it.
     */
    await expect(page.getByTestId("game-hero")).toContainText("Legacy Pitch 3");
    await expect(
      page.getByTestId("game-info-card"),
      "the pitch name is being stated twice again",
    ).not.toContainText("Legacy Pitch 3");
  } finally {
    await admin.from("games").update({ pitch_name: previous }).eq("id", game!.id);
  }
});

test("the venue is where a pitch is named now", async ({ page, context }) => {
  await signInAs(context, players.organizer);
  await page.goto("/admin/venues", { waitUntil: "networkidle" });

  // The control the game form used to duplicate, on the surface that owns it.
  await page.getByTestId("venue-summary").first().click();
  await expect(page.getByTestId("venue-pitch-input").first()).toBeVisible();
});
