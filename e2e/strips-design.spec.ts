import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold.ts";
import { players, serviceClient, signInAs } from "./helpers/session.ts";

/**
 * Design-leg strips — the review surface for Oliver's batch verdicts.
 *
 * NOT ASSERTIONS. These produce artefacts to look at, at phone width, and
 * assert only enough to know the page rendered. Written to
 * `screenshots/design-1/`, gitignored.
 *
 * Numbered by the Stage-1 item they answer, so a verdict can be given against
 * the list rather than against a filename.
 *
 * Run with:  npx playwright test e2e/strips-design.spec.ts
 */

const OUT = path.resolve(process.cwd(), "screenshots", "design-1");

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

async function strip(page: import("@playwright/test").Page, name: string) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}

/** Item 1 — the home page: no stat windows, 01/02/03 back in the hero. */
test("01-home", async ({ page }) => {
  const admin = serviceClient();
  await admin.rpc("set_site_setting", { p_key: "active_players", p_value: 250 });
  await admin.rpc("set_site_setting", {
    p_key: "player_of_month",
    p_value: players.runner.id,
  });

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByTestId("stats-strip")).toHaveCount(0);
  await strip(page, "01-home-hero");

  await page.getByTestId("how-it-works").scrollIntoViewIfNeeded();
  await strip(page, "01-home-how-it-works");

  await page.getByTestId("community-heading").scrollIntoViewIfNeeded();
  await strip(page, "01-home-community");
});

/** Items 2 + 3 — the list defaults to everything, and badges are visible. */
test("02-games-list", async ({ page }) => {
  const day1 = await createScratchGame({ hoursFromNow: 24 * 2, format: "5v5" });
  const day2 = await createScratchGame({
    hoursFromNow: 24 * 4,
    allowedSkillLevels: ["beginner", "intermediate"],
    format: "6v6",
    subsPerTeam: 2,
  });
  const day3 = await createScratchGame({ hoursFromNow: 24 * 6 });

  try {
    // Default: ALL upcoming, chronological, day-grouped.
    await page.goto("/games", { waitUntil: "networkidle" });
    await expect(page.getByTestId("day-heading").first()).toBeVisible();
    await strip(page, "02-games-list-all");

    // The badge is on the row now, because the row is on screen.
    const row = page.locator(`[data-testid="game-row"][href="/game/${day2.id}"]`);
    await expect(row.getByTestId("skill-badge-beginner")).toBeVisible();
    await row.scrollIntoViewIfNeeded();
    await strip(page, "03-games-list-skill-badges");

    // Filtered, and the way back out.
    await page.getByTestId("day-tab").nth(1).click();
    await page.waitForLoadState("networkidle");
    await strip(page, "02-games-list-filtered");

    await page.getByTestId("day-tab-all").click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("day-heading")).not.toHaveCount(0);
    await strip(page, "02-games-list-cleared");

    // And on the detail.
    await page.goto(`/game/${day2.id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("skill-badges")).toBeVisible();
    await strip(page, "03-game-detail-skill-badges");
  } finally {
    await destroyScratchGame(day1.id);
    await destroyScratchGame(day2.id);
    await destroyScratchGame(day3.id);
  }
});

/** Items 4 + 6 — the avatar is the control; three grey links, no panel. */
test("04-account", async ({ page, context }) => {
  await signInAs(context, players.runner);
  await page.goto("/account", { waitUntil: "networkidle" });
  await expect(page.getByTestId("photo-avatar-control")).toBeVisible();
  await strip(page, "04-account-photo-and-links");

  await page.getByTestId("account-security").scrollIntoViewIfNeeded();
  await strip(page, "06-account-security-links");

  await page.getByTestId("change-password-link").click();
  await strip(page, "06-account-security-open");
});

/** Item 5 — "Sign in" in the header, "Not a member yet?" on the login page. */
test("05-auth-copy", async ({ page }) => {
  await page.goto("/games", { waitUntil: "networkidle" });
  await expect(page.getByTestId("nav-login")).toHaveText(/sign in/i);
  await strip(page, "05-header-sign-in");

  await page.goto("/login", { waitUntil: "networkidle" });
  await expect(page.getByTestId("login-signup-link")).toBeVisible();
  await strip(page, "05-login-signup-link");
});

/** Item 7 — the venue photo upload, and the panel it feeds. */
test("07-venue-photo", async ({ page, context }) => {
  const game = await createScratchGame({ hoursFromNow: 24 * 8 });

  try {
    await signInAs(context, players.organizer);
    await page.goto(`/admin/games/${game.id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("venue-photo-input")).toBeAttached();
    await page.getByTestId("venue-photo-input").scrollIntoViewIfNeeded();
    await strip(page, "07-admin-venue-photo-upload");
  } finally {
    await destroyScratchGame(game.id);
  }
});
