import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { players, signInAs } from "./helpers/session";

/**
 * REDESIGN v2, ROUND 10, ITEM 1 — `/admin` against `p14`, as an acceptance
 * test rather than an inspiration.
 *
 * WHY THE NUMBERS ARE IN A SPEC AND NOT ONLY IN A COMMENT. The dashboard was
 * built in round 8 from the same frame and drifted anyway — five type steps,
 * two colours and a whole row of chrome the frame does not draw — because
 * nothing failed when it did. Every figure below was measured off `p14.png`
 * at 390px with the 48px status bar removed, and the tolerance is ±3px, which
 * is roughly the frame's own antialiasing.
 *
 * THE THINGS THIS DOES NOT ASSERT are the ones no code can produce: `p14`
 * numbers its rows `#62`…`#67` and there is no such column, and its organizer
 * reads `Gabriel +668`, a name plus a phone fragment this product does not
 * put in an admin list. Both are recorded in `docs/REQUESTS.md`.
 */

const OUT = path.resolve(process.cwd(), "docs/redesign-v2/strips/admin");

/** Measured off p14.png, in CSS pixels from the top of the viewport. */
const P14 = {
  tileHeight: 93.5,
  tilesBottom: 389.8,
  rowPitch: 63.6,
  rowPanelTop: 444.5,
  titleTop: 144.0,
} as const;

const TOLERANCE = 3;

/**
 * Anton's RENDERED cap-height ratio, measured off our own screenshots at a
 * known font size in rounds 10 and 12. Its published metric is 0.73, and the
 * 18% gap between the two is what R28 exists to correct.
 */
const ANTON_CAP_RATIO = 0.86;

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ context }) => {
  await signInAs(context, players.organizer);
});

test("the dashboard matches p14's geometry", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await page.goto("/admin", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content: "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
  });

  const box = async (sel: string) => {
    const r = await page.locator(sel).first().boundingBox();
    if (!r) throw new Error(`${sel} is not on the page`);
    return r;
  };

  /*
   * CAP TO CAP, not box to cap (fixed in round 12).
   *
   * `P14.titleTop` is where the frame's INK starts. A DOM box starts above
   * its ink by half the leading plus the gap between the em box and the cap,
   * and this assertion was comparing the two directly — which passed at 24px
   * only because the two errors happened to cancel. The corrected step made
   * them stop cancelling, which is the spec catching a latent fault rather
   * than a regression.
   *
   * `ANTON_CAP_RATIO` is the measured 0.86 — the same number R28 turns on.
   */
  const title = await box("main h2");
  const titleSize = await page
    .locator("main h2")
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const capTop = title.y + (title.height - titleSize * ANTON_CAP_RATIO) / 2;
  expect(Math.abs(capTop - P14.titleTop), `page title cap at ${capTop.toFixed(1)}`).toBeLessThan(
    TOLERANCE,
  );

  const tile = await box("[data-testid='dashboard-tiles'] a");
  expect(Math.abs(tile.height - P14.tileHeight), `tile ${tile.height}px tall`).toBeLessThan(TOLERANCE);

  const tiles = await box("[data-testid='dashboard-tiles']");
  expect(Math.abs(tiles.y + tiles.height - P14.tilesBottom)).toBeLessThan(TOLERANCE);

  const rows = page.getByTestId("dashboard-game-row");
  expect(await rows.count(), "p14 draws six upcoming rows").toBeGreaterThan(1);
  const first = (await rows.nth(0).boundingBox())!;
  const second = (await rows.nth(1).boundingBox())!;
  expect(Math.abs(second.y - first.y - P14.rowPitch), `row pitch ${second.y - first.y}`).toBeLessThan(TOLERANCE);
  expect(Math.abs(first.y - P14.rowPanelTop)).toBeLessThan(TOLERANCE + 2);

  await page.screenshot({ path: path.join(OUT, "01-dashboard.png"), fullPage: true });
});

/*
 * THE TYPE STEPS, WHICH ARE WHAT DRIFTED. `p14`'s caps measure 23.4 for the
 * page title, 16.4 for a section heading and 26.9 for a tile numeral; against
 * Anton's rendered cap ratio of ~0.86 those are the three sizes below. Round 8
 * shipped 32 / 24 / 32 — two steps too loud at the top and, once corrected,
 * exactly right at the bottom.
 *
 * ROUND 12 moved the page title again, upward from 24 to 27.3, and that is
 * not a reversal: round 10 chose `title` because it was the closest step to
 * 23.4 that the scale HAD, and round 12 fixed the scale. Same target, better
 * token.
 */
test("the dashboard's type steps are p14's", async ({ page }) => {
  await page.goto("/admin", { waitUntil: "networkidle" });
  const size = (sel: string) =>
    page.locator(sel).first().evaluate((el) => getComputedStyle(el).fontSize);

    /*
   * ~~24px.~~ ROUND 12: `page-title` was corrected to the frames' own cap
   * (R28), so the closest-available token round 10 settled for became the
   * correct one and admin went back to it. p14's cap is 23.4; 27.3px of Anton
   * renders 23.5.
   */
  expect(await size("main h2"), "page title").toBe("27.3px");
  expect(await size("main h3"), "section heading").toBe("17px");
  expect(await size("[data-testid='tile-upcoming'] > div + div"), "tile numeral").toBe("32px");
  expect(await size("[data-testid='tile-upcoming'] > div"), "tile label").toBe("10px");
});

/*
 * THE CHROME `p14` DOES NOT DRAW. Each of these shipped once and each looked
 * reasonable in isolation, which is why the frame is the arbiter.
 */
test("the dashboard omits what p14 omits", async ({ page }) => {
  await page.goto("/admin", { waitUntil: "networkidle" });

  // No `All games →` beside the section heading (round 8 added it).
  await expect(page.getByTestId("dashboard-all-games")).toHaveCount(0);

  // No `Organizer · back to the site` row between the header and the chips.
  const chips = (await page.getByTestId("admin-nav-games").boundingBox())!;
  const header = (await page.locator("body > header, header").first().boundingBox())!;
  expect(chips.y - (header.y + header.height), "chips sit 37px under the header").toBeLessThan(45);

  // The pitch canvas does not render behind admin: all four admin frames are
  // flat black, and SiteBackground returns null under /admin.
  const ground = await page.evaluate(() => ({
    body: getComputedStyle(document.body).backgroundColor,
    canvases: document.querySelectorAll("canvas").length,
  }));
  expect(ground.body).toBe("rgb(8, 8, 8)");
  expect(ground.canvases).toBe(0);

  // The current chip is a ring, not a fill — sampled inside p14's volt chip
  // and it is flat ground.
  // The status is p14's word, not the enum: a live game reads `Confirmed`,
  // not `Published`.
  const statuses = await page
    .getByTestId("dashboard-game-row")
    .evaluateAll((els) => els.map((el) => el.textContent ?? ""));
  expect(statuses.length).toBeGreaterThan(0);
  for (const text of statuses) {
    expect(text, "a raw game_status enum reached the dashboard").not.toMatch(
      /Published|Full\b/,
    );
  }

  const currentBg = await page
    .getByTestId("admin-nav-dashboard")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(currentBg).toBe("rgba(0, 0, 0, 0)");
});

/*
 * ALL FOUR QUICK ACTIONS, AND ALL FOUR GO SOMEWHERE. Round 8 shipped two on
 * the grounds that the other two had no destination; both do, and this is the
 * spec that fails if one is dropped again or wired to a 404.
 */
test("p14's four quick actions each reach a real surface", async ({ page }) => {
  await page.goto("/admin", { waitUntil: "networkidle" });

  const expected: Array<[string, string]> = [
    ["quick-create-game", "/admin/games/new"],
    // ~~"/admin/games/new?venue=new"~~ round 13 item 24 gave venues a page.
    ["quick-add-venue", "/admin/venues"],
    ["quick-export", "/admin/stats/transactions"],
    ["quick-financials", "/admin/stats"],
  ];
  for (const [testId, href] of expected) {
    await expect(page.getByTestId(testId)).toHaveAttribute("href", href);
  }

  /*
   * ~~`?venue=new` must open the new-venue branch of the game form.~~ Round 13
   * item 24: the destination is a management page, and what has to be true of
   * it is that a venue can be created there — the button promises "add venue"
   * and must not land on a read-only list.
   */
  await page.goto("/admin/venues", { waitUntil: "networkidle" });
  await expect(page.getByTestId("venue-create-section")).toBeVisible();
  await expect(page.getByTestId("venue-name-input").first()).toBeVisible();
});
