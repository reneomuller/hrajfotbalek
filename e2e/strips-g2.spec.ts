import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold.ts";
import { players, signInAs } from "./helpers/session.ts";

/**
 * G2 screenshot strips — the review surface for the UX loop (contract §8).
 *
 * NOT ASSERTIONS, the same as `strips.spec.ts`: these produce artefacts for a
 * human to review in a batch at phone width. They assert only enough to know
 * the page rendered, because a strip whose failure mode is a red test is a
 * strip nobody ever looks at.
 *
 * Pixel 7 is the project's only viewport (`playwright.config.ts`), so "phone
 * width" needs no per-test setup here — it is the default.
 *
 * Written to `screenshots/g2/`, gitignored. A snapshot of a moment, not a
 * baseline: visual-regression diffing is a different tool with different
 * upkeep, and committing PNGs would make every copy change a binary diff.
 *
 * Numbered by the phase that added them, so the batch reads in build order.
 *
 * Run with:  npx playwright test e2e/strips-g2.spec.ts
 */

const OUT = path.resolve(process.cwd(), "screenshots", "g2");

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

async function strip(page: import("@playwright/test").Page, name: string) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}

// --- Phase 13 ----------------------------------------------------------------

test("the admin game form, with organizer, duration and skill", async ({ page, context }) => {
  await signInAs(context, players.organizer);

  await page.goto("/admin/games/new", { waitUntil: "networkidle" });
  // The organizer field arrives pre-filled with the creating admin's nickname
  // (REQ-GAME-001) — worth seeing in the strip, because "required" and
  // "already answered" are what make it unobtrusive rather than an obstacle.
  await expect(page.getByTestId("organizer-name")).toHaveValue(players.organizer.nickname);
  await strip(page, "13-admin-game-form");
});

// --- Phase 14 ----------------------------------------------------------------

test("the time span on the list and on the detail", async ({ page }) => {
  const game = await createScratchGame({ durationMinutes: 90, hoursFromNow: 24 * 18 });

  try {
    await page.goto("/games", { waitUntil: "networkidle" });
    await strip(page, "14-games-list-span");

    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("game-time-span")).toBeVisible();
    await strip(page, "14-game-detail-span");
  } finally {
    await destroyScratchGame(game.id);
  }
});
