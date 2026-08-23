import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold.ts";
import { apiClientFor, players, serviceClient } from "./helpers/session.ts";

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

    /*
      Item 1 again — the filter, narrowed and cleared. `data-empty` went with
      the rest days: the restored control (ruling, 2026-08-10) only draws days
      that HAVE games, so every tab is non-empty by construction.
    */
    const targetDay = page.getByTestId("day-tab").nth(1);
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

/**
 * Items 5–7 — the home page.
 *
 * The settings are written first so the strip shows real numbers rather than a
 * panel that happens to be empty on this machine, and put back afterwards:
 * `site_settings` is a singleton and every spec touching it shares one row.
 */
test("B5-B7-home", async ({ page }) => {
  const admin = serviceClient();
  await admin.rpc("set_site_setting", { p_key: "games_per_week", p_value: 7 });
  await admin.rpc("set_site_setting", { p_key: "active_players", p_value: 500 });
  await admin.rpc("set_site_setting", {
    p_key: "player_of_month",
    p_value: players.runner.id,
  });

  await page.goto("/", { waitUntil: "networkidle" });

  // Item 7 — three list rows where one card used to be.
  await page.getByTestId("next-matches").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("next-matches")).toBeVisible();
  await strip(page, "B7-next-matches");

  // Item 5 — the split: an invitation with real brand marks, then the numbers.
  await page.getByTestId("community-panel").scrollIntoViewIfNeeded();
  await strip(page, "B5-community-and-stats");

  // The standalone stats panel is gone (Section 2, item 8) — the two numbers
  // live in the community panel, which is what this strip now captures.
  await page.getByTestId("community-stats").scrollIntoViewIfNeeded();
  await strip(page, "B5-community-stats");

  // Item 6 — the heading reads FAQ.
  await page.getByTestId("faq-panel").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("faq-panel")).toContainText("FAQ");
  await strip(page, "B6-faq-heading");
});

/** Item 5 — both numbers are admin-editable, on one screen. */
test("B5-admin-numbers", async ({ page, context }) => {
  const { signInAs } = await import("./helpers/session.ts");
  await signInAs(context, players.organizer);

  await page.goto("/admin/site", { waitUntil: "networkidle" });
  await expect(page.getByTestId("games-per-week-input")).toBeVisible();
  await expect(page.getByTestId("active-players-input")).toBeVisible();
  await strip(page, "B5-admin-editable-numbers");
});

/**
 * Items 8–14 — the rebuilt game detail, in two passes.
 *
 * A venue WITH a photo and one without, because the hero is the item where the
 * two states differ most and "graceful no-photo fallback" is half the ask.
 * Signed in for the second pass: the organizer's phone, the WhatsApp
 * affordance and the priced CTA only exist for someone who could act on them.
 */
test("C8-C14-game-detail", async ({ page }) => {
  const game = await createScratchGame({
    hoursFromNow: 24 * 3,
    capacity: 12,
    priceCzk: 250,
    format: "6v6v6",
    subsPerTeam: 2,
    durationMinutes: 90,
    allowedSkillLevels: ["intermediate"],
    withVenuePhoto: true,
    amenities: ["bibs", "gloves", "balls", "water", "showers", "parking", "lockers"],
  });

  try {
    // Two players on the roster, so the lineup shows faces and counts rather
    // than an empty state.
    const organizer = await apiClientFor(players.organizer);
    for (const playerId of [players.runner.id, players.creditPartial.id]) {
      await organizer.rpc("admin_create_booking", {
        p_game_id: game.id,
        p_player_id: playerId,
        p_payment_method: "cash",
      });
    }

    // --- signed out: what a shared WhatsApp link opens --------------------
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });

    // Item 8 — full-bleed hero with the name over it.
    await expect(page.getByTestId("game-hero")).toHaveAttribute("data-photo", "true");
    await strip(page, "C8-hero-full-bleed");

    // Items 9 + 10 — the info card and the availability FOMO treatment.
    await page.getByTestId("game-info-card").scrollIntoViewIfNeeded();
    await strip(page, "C9-info-card");

    await page.getByTestId("availability-card").scrollIntoViewIfNeeded();
    await strip(page, "C10-availability");

    // Item 11 — what's included.
    await page.getByTestId("amenity-grid").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("amenity")).toHaveCount(7);
    await strip(page, "C11-whats-included");

    // Item 13 — the players list with games-played counts.
    await page.getByTestId("players-list").scrollIntoViewIfNeeded();
    await strip(page, "C13-players-list");

    // Item 14 — the CTA is still there after scrolling to the bottom, which is
    // the entire reason it is fixed rather than sticky.
    // `practical-info` was removed in round 16 item 4; the fact card is the
    // surface that carries duration and arrival now.
    await page.getByTestId("game-info-card").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("claim-bar")).toBeInViewport();
    await strip(page, "C14-sticky-cta-at-the-bottom");

    // --- signed in: the organizer's number and the priced button -----------
    const { signInAs } = await import("./helpers/session.ts");
    await signInAs(page.context(), players.organizer);
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });

    // Item 12 — organizer with avatar and a WhatsApp affordance.
    await page.getByTestId("game-organizer").scrollIntoViewIfNeeded();
    await strip(page, "C12-organizer-card");
  } finally {
    await destroyScratchGame(game.id);
  }
});

/** Item 8 — the no-photo fallback, which is half of what "graceful" means. */
test("C8-game-detail-no-photo", async ({ page }) => {
  const game = await createScratchGame({ hoursFromNow: 24 * 5, amenities: [] });

  try {
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("game-hero")).toHaveAttribute("data-photo", "false");
    // And no "What's included" card at all, rather than an empty one.
    await expect(page.getByTestId("amenity-grid")).toHaveCount(0);
    await strip(page, "C8-hero-no-photo");
  } finally {
    await destroyScratchGame(game.id);
  }
});

/**
 * Item 11 — the admin surface behind the grid.
 *
 * ~~On the GAME page, where the amenity boxes lived.~~ ROUND 14 ITEM 2 moved
 * them to `/admin/venues`: they always wrote to the VENUE, so editing them
 * from one game silently changed every other game at that ground and the
 * surface gave no hint of it. The strip follows the control.
 */
test("C11-admin-amenities", async ({ page, context }) => {
  const { signInAs } = await import("./helpers/session.ts");
  await signInAs(context, players.organizer);
  await page.goto("/admin/venues", { waitUntil: "networkidle" });

  // The venue rows are collapsed by default; the amenity grid is inside one.
  await page.getByTestId("venue-summary").first().click();
  await page.getByTestId("amenity-bibs").first().scrollIntoViewIfNeeded();
  await strip(page, "C11-admin-what-this-pitch-provides");
});

/** Item 15 — the app shell: bottom tabs, and the CTA stacked above them. */
test("D15-app-shell", async ({ page, context }) => {
  const game = await createScratchGame({ hoursFromNow: 24 * 4, capacity: 12 });

  try {
    await page.goto("/games", { waitUntil: "networkidle" });
    await expect(page.getByTestId("nav-pill")).toBeVisible();
    await strip(page, "D15-tab-bar-games");

    // The one place two fixed things stack.
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    await strip(page, "D15-tab-bar-under-sticky-cta");

    await page.goto("/pass", { waitUntil: "networkidle" });
    await strip(page, "D15-tab-bar-pass-active");

    const { signInAs } = await import("./helpers/session.ts");
    await signInAs(context, players.runner);
    await page.goto("/my-games", { waitUntil: "networkidle" });
    await strip(page, "D15-my-games");

    await page.goto("/account", { waitUntil: "networkidle" });
    await strip(page, "D15-account-without-fixtures");
  } finally {
    await destroyScratchGame(game.id);
  }
});

/** Item 16 — the five exports, in place on the tables they belong to. */
test("D16-admin-exports", async ({ page, context }) => {
  const game = await createScratchGame({ hoursFromNow: 24 * 6, capacity: 8 });

  try {
    const { signInAs } = await import("./helpers/session.ts");
    await signInAs(context, players.organizer);

    for (const [path, testId, name] of [
      ["/admin/games", "export-games", "D16-admin-games"],
      ["/admin/players", "export-players", "D16-admin-players"],
      // ~~["/admin/topups", ...]~~ retired in round 13 item 8.
      ["/admin/stats", "export-stats", "D16-admin-stats"],
      [`/admin/games/${game.id}`, "export-roster", "D16-admin-game-roster"],
    ] as const) {
      await page.goto(path, { waitUntil: "networkidle" });
      await expect(page.getByTestId(testId)).toBeVisible();
      await strip(page, name);
    }
  } finally {
    await destroyScratchGame(game.id);
  }
});
