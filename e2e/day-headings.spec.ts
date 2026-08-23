import { expect, test } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold";

/**
 * ROUND 16 ITEM 7 — the date above a day's games, on BOTH surfaces.
 *
 * THE DEFECT WAS A DIVERGENCE, not a missing heading. Home and `/games` each
 * had one, hand-written in each file. Round 14 item 4 corrected the games page
 * and left home on the old 11px uppercase eyebrow, so the same complaint
 * arrived a second time about a different page.
 *
 * SO THE ASSERTION IS THE AGREEMENT. Checking that each page has a heading
 * would have passed throughout — both always did. What was untrue is that they
 * MATCH, and that is the property a shared component now guarantees and this
 * test pins.
 */

test.use({ viewport: { width: 390, height: 844 } });

const HOURS_PER_DAY = 24;

/** Font size, weight, transform and colour — everything that makes a heading
 *  read as one, read off the rendered element rather than off a class name. */
async function treatmentOf(locator: import("@playwright/test").Locator) {
  return locator.first().evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      textTransform: s.textTransform,
      color: s.color,
    };
  });
}

test("home and the games page treat a day heading identically", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);

  /*
   * A GAME FOUR DAYS OUT, which is the case the owner reported: far enough
   * that its heading is a bare date with no "Today" to prop it up. Both pages
   * must render a group for it, and both must render it the same way.
   */
  const game = await createScratchGame({
    capacity: 8,
    hoursFromNow: 4 * HOURS_PER_DAY + 3,
  });

  try {
    await page.goto("/games");
    const onGames = await treatmentOf(page.getByTestId("day-heading"));
    const gamesText = await page.getByTestId("day-heading").first().innerText();

    await page.goto("/");
    await expect(page.getByTestId("day-heading").first()).toBeVisible();
    const onHome = await treatmentOf(page.getByTestId("day-heading"));

    expect(onHome, "home and /games style their day headings differently").toEqual(onGames);

    /*
     * AND IT IS A HEADING, not an eyebrow. Pinned as an absolute so a future
     * edit that quietly returns BOTH pages to 11px uppercase — which would
     * still satisfy the equality above — fails here instead.
     */
    expect(parseFloat(onHome.fontSize), "the day heading is eyebrow-sized again").toBeGreaterThan(
      14,
    );
    expect(onHome.textTransform, "the day heading is uppercase again").toBe("none");

    // The far date carries a weekday and a month, with no relative word to
    // lean on — the shape the owner said was missing.
    expect(gamesText).toMatch(/[A-Z][a-z]{2}\s+\d{1,2}\s+[A-Z][a-z]{2}/);
  } finally {
    await destroyScratchGame(game.id);
  }
});
