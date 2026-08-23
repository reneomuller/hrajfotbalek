import { expect, test } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { apiClientFor, players, signInAs } from "./helpers/session";
import { clearActiveBookings, createScratchGame, destroyScratchGame } from "./helpers/scaffold";

/**
 * ROUND 16 ITEMS 8 AND 9 — two affordances on the games page.
 *
 * BOTH ARE THE SAME KIND OF DEFECT: an element that WORKS and does not look
 * like it does. Neither would fail a functional test, which is why neither had
 * one, and why the assertions here are about computed appearance.
 */

test.use({ viewport: { width: 390, height: 844 } });

test("your next game reads as something you can tap", async ({ page, context }) => {
  const game = await createScratchGame({ capacity: 8, hoursFromNow: 30 });

  try {
    await clearActiveBookings("runner");
    const organizer = await apiClientFor(players.organizer);
    const { error } = await organizer.rpc("admin_create_booking", {
      p_game_id: game.id,
      p_player_id: players.runner.id,
      p_payment_method: "cash",
    });
    expect(error, error?.message).toBeNull();

    await signInAs(context, players.runner);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);
    await page.goto("/games");

    const row = page.getByTestId("next-game-row");
    await expect(row).toBeVisible();

    /*
     * IT WAS ALWAYS A LINK. Round 14 made it a My-games row, which is flat by
     * design — correct on a screen that is nothing but such rows, and a
     * caption when it stands alone above a column of cards. So "is it an
     * anchor" is not the question; "does it look like one" is.
     */
    expect(await row.evaluate((el) => el.tagName)).toBe("A");

    const skin = await row.evaluate((el) => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, radius: parseFloat(s.borderTopLeftRadius) };
    });

    // A surface, not the page ground: something has to separate it from the
    // text around it before a reader will try pressing it.
    expect(skin.background, "the next-game row has no surface of its own").not.toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(skin.radius, "the next-game row is not a card").toBeGreaterThan(4);

    // And a direction marker, which is the part that says "this goes
    // somewhere" without needing a hover a phone cannot perform.
    await expect(row).toContainText("→");

    // Still does what it did.
    await row.click();
    await page.waitForURL(new RegExp(`/game/${game.id}`));
  } finally {
    await clearActiveBookings("runner");
    await destroyScratchGame(game.id);
  }
});

test("the All chip is legible beside the day numerals", async ({ page, context }) => {
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);
  await page.goto("/games");

  const all = page.getByTestId("day-tab-all");
  await expect(all).toBeVisible();

  const size = await all.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size, "the All chip is back at caption size").toBeGreaterThanOrEqual(15);

  /*
   * AND THE CHIP ITSELF DID NOT GROW. Round 14 sized these cells against the
   * 44px tap floor and the scrolling row; item 9 asked for the LABEL only, and
   * a font bump that quietly widened the box would be a different change.
   */
  const [allBox, dayBox] = await Promise.all([
    all.boundingBox(),
    page.getByTestId("day-tab").first().boundingBox(),
  ]);
  expect(allBox!.width, "the All chip is no longer the same box as a day").toBeCloseTo(
    dayBox!.width,
    0,
  );
  expect(allBox!.height).toBeCloseTo(dayBox!.height, 0);

  // It must not have overflowed its cell in the process.
  const overflows = await all.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(overflows, "the All label overflows its chip").toBe(false);
});
