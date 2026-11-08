import { expect, test } from "@playwright/test";
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

/*
 * ~~THE DASHBOARD MATCHES p14'S GEOMETRY~~ — RETIRED IN ROUND 42, on the
 * owner's word: "update the design of all the pages in admin. all of them.
 * yet ... retain the visual for the most part of the web's current". The
 * rebuilt dashboard puts what needs a human first, gives every tile a line
 * saying what it counts, and draws a seat bar under every game row — so p14's
 * tile height, tile bottom and row pitch are no longer the design, and holding
 * them would hold the old page.
 *
 * WHAT STAYS PINNED is what the redesign kept on purpose: the page title where
 * p14 put its cap, two tiles to a row at phone width, nothing wider than the
 * screen, and a seat bar on every row.
 */
test("the dashboard keeps p14's title and lays out at 390px", async ({ page }) => {
  await page.goto("/admin", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content: "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none !important}",
  });

  // The page title, cap to cap — see round 12's note in the history.
  const heading = page.getByTestId("admin-page-header").locator("h2");
  const title = (await heading.boundingBox())!;
  const titleSize = await heading.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const capTop = title.y + (title.height - titleSize * ANTON_CAP_RATIO) / 2;
  expect(Math.abs(capTop - P14.titleTop), `page title cap at ${capTop.toFixed(1)}`).toBeLessThan(
    TOLERANCE,
  );

  // Four tiles, two to a row: read against each other, as the reference has them.
  const tiles = page.getByTestId("dashboard-tiles").locator(":scope > a");
  await expect(tiles).toHaveCount(4);
  const boxes = await Promise.all([0, 1, 2].map(async (i) => (await tiles.nth(i).boundingBox())!));
  expect(Math.abs(boxes[0]!.y - boxes[1]!.y), "first two tiles share a row").toBeLessThan(1);
  expect(Math.abs(boxes[0]!.width - boxes[1]!.width), "and a width").toBeLessThan(1);
  expect(boxes[2]!.y, "the third starts a second row").toBeGreaterThan(boxes[0]!.y + boxes[0]!.height - 1);

  // Nothing is wider than the phone.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "no horizontal page scroll").toBeLessThanOrEqual(0);

  // Every upcoming game row carries its seat bar.
  const rows = page.getByTestId("dashboard-game-row");
  expect(await rows.count(), "the seed has upcoming games").toBeGreaterThan(1);
  for (const i of [0, 1]) {
    await expect(rows.nth(i).getByTestId("dashboard-seat-bar")).toBeVisible();
  }
});

/*
 * THE TYPE STEPS. `p14`'s caps measure 23.4 for the page title and 26.9 for a
 * tile numeral; against Anton's rendered cap ratio of ~0.86 those are 27.3px
 * and 32px, and both are kept. ~~A section heading at 17px (`main h3`)~~ —
 * since round 42 every section is a `Panel`, titled by the eyebrow label the
 * rest of admin uses, at 10px.
 */
test("the dashboard's type steps are p14's, with round 42's section labels", async ({ page }) => {
  await page.goto("/admin", { waitUntil: "networkidle" });
  const size = (sel: string) =>
    page.locator(sel).first().evaluate((el) => getComputedStyle(el).fontSize);

  expect(await size("[data-testid='admin-page-header'] h2"), "page title").toBe("27.3px");
  expect(await size("main section h2"), "section label").toBe("10px");
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
