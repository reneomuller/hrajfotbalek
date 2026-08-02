import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold.ts";
import { apiClientFor, players } from "./helpers/session.ts";

/**
 * Design pass 2 strips — the review surface for Oliver's per-stage verdicts.
 *
 * NOT ASSERTIONS. These produce artefacts to look at, at phone width, and
 * assert only enough to know the page rendered what the strip is named after.
 * Written to `screenshots/design-2/`, gitignored.
 *
 * Numbered by the BRIEF ITEM they answer, so a verdict can be given against the
 * numbered list rather than against a filename. A separate file from
 * `strips-design.spec.ts` because that one answers pass 1 and its numbering
 * means something different.
 *
 * Run with:  npx playwright test e2e/strips-design2.spec.ts
 */

const OUT = path.resolve(process.cwd(), "screenshots", "design-2");

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

async function strip(page: import("@playwright/test").Page, name: string) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}

/**
 * Items 1–3 — the calendar strip, the rows, and the spots-left ladder.
 *
 * The board is built to put all three colour rungs on one screen, because the
 * ladder is the thing hardest to judge from a description: capacities of 20, 10
 * and 3 sit exactly on the thresholds, and the fourth game is filled so a
 * "Full" row is in the same picture as a red one.
 */
test("A1-A3-games-list", async ({ page }) => {
  const plenty = await createScratchGame({
    hoursFromNow: 24 * 2,
    capacity: 20,
    format: "6v6v6",
    subsPerTeam: 2,
  });
  const few = await createScratchGame({
    hoursFromNow: 24 * 2 + 1,
    capacity: 10,
    format: "5v5",
    allowedSkillLevels: ["beginner", "intermediate"],
  });
  const critical = await createScratchGame({
    hoursFromNow: 24 * 4,
    capacity: 3,
    format: "7v7v7",
  });
  const full = await createScratchGame({ hoursFromNow: 24 * 6, capacity: 1 });

  try {
    const organizer = await apiClientFor(players.organizer);
    for (const [gameId, playerId] of [
      [full.id, players.runner.id],
      [critical.id, players.creditPartial.id],
    ] as const) {
      await organizer.rpc("admin_create_booking", {
        p_game_id: gameId,
        p_player_id: playerId,
        p_payment_method: "cash",
      });
    }

    await page.goto("/games", { waitUntil: "networkidle" });
    await expect(page.getByTestId("day-heading").first()).toBeVisible();

    // Item 1 — real dates, rolling, continuous.
    await expect(page.getByTestId("day-tab").first()).toBeVisible();
    await strip(page, "A1-day-strip-real-dates");

    // Items 2 + 3 — no price, format present, the FOMO count in three colours.
    await strip(page, "A2-A3-rows-no-price-format-spots");

    // The three-way format, close up, and the amber and red rows.
    await page
      .locator(`[data-testid="game-row"][href="/game/${critical.id}"]`)
      .scrollIntoViewIfNeeded();
    await strip(page, "A3-spots-critical-and-full");

    // Item 1 again — the strip as a filter, narrowed and cleared.
    const targetDay = page.locator('[data-testid="day-tab"][data-empty="false"]').nth(1);
    await targetDay.click();
    await page.waitForLoadState("networkidle");
    await strip(page, "A1-day-strip-filtered");

    await page.getByTestId("day-tab-all").click();
    await page.waitForLoadState("networkidle");
    await strip(page, "A1-day-strip-cleared");
  } finally {
    await destroyScratchGame(plenty.id);
    await destroyScratchGame(few.id);
    await destroyScratchGame(critical.id);
    await destroyScratchGame(full.id);
  }
});

/** Item 4 — the pass panel fits the phone, and the tiers start at five. */
test("A4-pass", async ({ page }) => {
  const game = await createScratchGame({ hoursFromNow: 24 * 3 });

  try {
    await page.goto("/games", { waitUntil: "networkidle" });

    const panel = page.getByTestId("pass-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("pass-panel-title")).toHaveText("Game Pass");
    await expect(panel.getByTestId("pass-panel-body")).toHaveText(
      "Pre-buy games at a discount",
    );

    /*
     * THE CLIPPING IS THE DEFECT, so it is measured rather than eyeballed: a
     * strip cannot show the difference between text that fits and text that
     * was truncated to fit. `scrollWidth > clientWidth` is exactly the
     * condition `truncate` hides.
     */
    for (const testId of ["pass-panel-title", "pass-panel-body"]) {
      const overflow = await panel
        .getByTestId(testId)
        .evaluate((node) => node.scrollWidth - node.clientWidth);
      expect(overflow, `${testId} is clipped at phone width`).toBeLessThanOrEqual(0);
    }

    await panel.scrollIntoViewIfNeeded();
    await strip(page, "A4-pass-panel-fits");

    await page.goto("/pass", { waitUntil: "networkidle" });
    await expect(page.getByTestId("pass-tier")).toHaveCount(5);
    await expect(page.locator('[data-testid="pass-tier"][data-games="1"]')).toHaveCount(0);
    await strip(page, "A4-pass-tiers-from-five");
  } finally {
    await destroyScratchGame(game.id);
  }
});
