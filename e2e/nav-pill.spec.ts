import { expect, test } from "@playwright/test";
import { apiClientFor, players, signInAs } from "./helpers/session.ts";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold.ts";

/**
 * THE NAV PILL IS FLUSH, FIXED, AND ON TOP — on every surface (night round,
 * item 4).
 *
 * ASSERTED WITH `document.elementFromPoint`, NOT BY READING z-index. This
 * codebase has been bitten twice by the same law: a `z-50` dialog that the nav
 * pill ate because `z-50` only ranked inside `main`'s `relative z-10`, and a
 * `fixed z-30` claim bar that the site footer painted over because the two were
 * siblings at equal rank. Both looked correct in CSS and in a screenshot. The
 * only question that settles it is "what is actually at this pixel", which is
 * what this asks, on each tab of the pill, on each surface.
 *
 * THE GAME DETAIL PAGE IS THE ONE THAT MATTERS. It is the only surface with a
 * second fixed bar — the claim bar sits at `bottom: var(--tabbar-h)`, directly
 * above the pill — so it is where a wrong footprint shows up as two bars
 * overlapping rather than stacking.
 */

test.use({ viewport: { width: 390, height: 844 } });

/** Every tab's centre must hit the pill, not something painted over it. */
async function assertPillOnTop(page: import("@playwright/test").Page, where: string) {
  const pill = page.getByTestId("nav-pill");
  await expect(pill, `${where}: no nav pill`).toBeVisible();

  const report = await page.evaluate(() => {
    const pillEl = document.querySelector('[data-testid="nav-pill"]')!;
    const tabs = Array.from(pillEl.querySelectorAll("a"));
    return tabs.map((tab) => {
      const r = tab.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        tab: tab.getAttribute("data-testid"),
        reachable: hit === tab || tab.contains(hit) || (hit != null && hit.contains(tab)),
        hit: hit
          ? `${hit.tagName.toLowerCase()}[${hit.getAttribute("data-testid") ?? ""}]`
          : "null",
      };
    });
  });

  for (const row of report) {
    expect(row.reachable, `${where}: ${row.tab} is covered by ${row.hit}`).toBe(true);
  }
  return report.length;
}

/** Flush means the bar's own bottom edge is the viewport's bottom edge. */
async function assertFlush(page: import("@playwright/test").Page, where: string) {
  const gap = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="nav-pill"]')!;
    const r = el.getBoundingClientRect();
    return { bottomGap: window.innerHeight - r.bottom, leftGap: r.left };
  });
  expect(gap.bottomGap, `${where}: gap under the bar`).toBe(0);
  expect(gap.leftGap, `${where}: gap beside the bar`).toBe(0);
}

test("the pill is flush and on top on home, games, pass and profile", async ({
  page,
  context,
}) => {
  await signInAs(context, players.runner);

  for (const [where, path] of [
    ["home", "/"],
    ["games", "/games"],
    ["pass", "/pass"],
    ["profile", "/account"],
  ] as const) {
    await page.goto(path, { waitUntil: "networkidle" });
    const tabs = await assertPillOnTop(page, where);
    expect(tabs).toBeGreaterThan(0);
    await assertFlush(page, where);

    // FIXED, not merely present at the top of the scroll. Scrolled to the
    // bottom is where the site footer lives, which is the element that
    // overpainted the claim bar in the last round.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(250);
    await assertPillOnTop(page, `${where} (scrolled to bottom)`);
    await assertFlush(page, `${where} (scrolled to bottom)`);
  }
});

test("the pill and the claim bar stack rather than overlap on a game", async ({
  page,
  context,
}) => {
  await signInAs(context, players.runner);
  const game = await createScratchGame({ capacity: 6, priceCzk: 200, hoursFromNow: 48 });

  try {
    // A booking, so the claim bar is in a state that carries a control rather
    // than a bare price — the states differ in height and the busiest one is
    // the one worth measuring.
    const player = await apiClientFor(players.runner);
    await player.rpc("create_booking", { p_game_id: game.id, p_payment_method: "cash" });

    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("claim-bar")).toBeVisible();

    await assertPillOnTop(page, "game detail");
    await assertFlush(page, "game detail");

    // THE CLAIM BAR SITS ON TOP OF THE PILL, not behind it and not over it:
    // its bottom edge should meet the pill's top edge.
    const geom = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="claim-bar"]')!.getBoundingClientRect();
      const pill = document.querySelector('[data-testid="nav-pill"]')!.getBoundingClientRect();
      return { barBottom: bar.bottom, pillTop: pill.top };
    });
    expect(
      Math.abs(geom.barBottom - geom.pillTop),
      "claim bar and pill do not meet — --tabbar-h disagrees with the bar height",
    ).toBeLessThanOrEqual(1);

    // And the claim bar's own control is still reachable, which is the bug the
    // footer z-index fix addressed and which must not regress.
    const cta = page.getByTestId("claim-bar").locator("a, button").first();
    const reachable = await cta.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit === el || el.contains(hit);
    });
    expect(reachable, "the claim bar's control is covered").toBe(true);
  } finally {
    await destroyScratchGame(game.id);
  }
});
