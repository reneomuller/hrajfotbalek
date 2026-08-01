import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold.ts";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session.ts";
import { pragueDayKey } from "../lib/games/days.ts";

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

// --- Phase 15a ---------------------------------------------------------------

test("the games list at row density, with the day picker", async ({ page }) => {
  // Six on one Prague day, so the strip shows the density criterion being met
  // rather than whatever the seed happens to hold. Pinned mid-afternoon UTC,
  // which is comfortably inside one local day at either DST offset.
  const day = pragueDayKey(new Date(Date.now() + 21 * 24 * 3600_000));
  const games = await Promise.all(
    ["14:00", "14:30", "15:00", "15:30", "16:00", "16:30"].map((time) =>
      createScratchGame({
        startsAt: `${day}T${time}:00.000Z`,
        capacity: 12,
        format: "5v5",
        subsPerTeam: 2,
      }),
    ),
  );
  // One restricted game on a second day, so the strip carries both a badge and
  // a second day tab.
  const other = await createScratchGame({
    startsAt: `${pragueDayKey(new Date(Date.now() + 23 * 24 * 3600_000))}T16:00:00.000Z`,
    allowedSkillLevels: ["advanced"],
  });

  try {
    await page.goto(`/games?day=${day}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("day-picker")).toBeVisible();
    await strip(page, "15a-games-list-rows");
  } finally {
    await Promise.all(games.map((game) => destroyScratchGame(game.id)));
    await destroyScratchGame(other.id);
  }
});

// --- Phase 15 ----------------------------------------------------------------

test("a restricted game, its organizer, and the roster", async ({ page, context }) => {
  const game = await createScratchGame({
    capacity: 12,
    format: "5v5",
    subsPerTeam: 2,
    durationMinutes: 90,
    allowedSkillLevels: ["intermediate", "advanced"],
    organizerName: "Jindra",
    organizerPhone: "+420777654321",
  });

  try {
    // Anonymous: badges, format, organizer name — and no phone.
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("skill-badges")).toBeVisible();
    await strip(page, "15-game-detail-restricted-anon");

    // Holding a spot: the booking panel replaces the claim CTA, and the phone
    // appears with the line that explains why it is visible.
    const runner = await apiClientFor(players.runner);
    await runner.rpc("create_booking", { p_game_id: game.id, p_payment_method: "cash" });

    await signInAs(context, players.runner);
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("your-booking")).toBeVisible();
    await strip(page, "15-game-detail-holder");

    await page.goto("/games", { waitUntil: "networkidle" });
    await strip(page, "15-games-list-badges");
  } finally {
    await destroyScratchGame(game.id);
  }
});

// --- Phase 16 ----------------------------------------------------------------

test("the reworked header, the venue fallback, the share pair and a toast", async ({
  page,
  context,
}) => {
  const game = await createScratchGame({ durationMinutes: 90, capacity: 6 });

  try {
    // Signed out: one Log in button, the language dropdown beside it.
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("nav-login")).toBeVisible();
    await strip(page, "16-detail-signed-out");

    // The language dropdown open, which is the control the reversal introduced.
    await page.getByTestId("locale-trigger").click();
    await expect(page.getByTestId("locale-menu")).toBeVisible();
    await strip(page, "16-language-dropdown");
    await page.keyboard.press("Escape");

    // The login page, which now carries the create-account path.
    await page.goto("/login", { waitUntil: "networkidle" });
    await strip(page, "16-login-with-signup");

    // Signed in: the avatar entry, and a toast landed by the redirect.
    await signInAs(context, players.runner);
    await page.goto(`/game/${game.id}/book`, { waitUntil: "networkidle" });
    await page.getByTestId("confirm-booking").click();
    await page.waitForURL(/\/book\/confirmation/);
    await expect(page.getByTestId("toast")).toBeVisible();
    await strip(page, "16-toast-booking-created");
  } finally {
    await destroyScratchGame(game.id);
  }
});

// --- Phase 17 ----------------------------------------------------------------

test("the reworked home page and the admin surface behind its numbers", async ({
  page,
  context,
}) => {
  const admin = serviceClient();
  const { data: before } = await admin
    .from("site_settings")
    .select("settings")
    .eq("id", "singleton")
    .maybeSingle();
  const previous = (before?.settings as Record<string, unknown> | undefined) ?? {};

  try {
    // Give the strip and the heading something real to render.
    await admin.rpc("set_site_setting", { p_key: "active_players", p_value: 250 });
    await admin.rpc("set_site_setting", {
      p_key: "player_of_month",
      p_value: players.runner.id,
    });

    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByTestId("stats-strip")).toBeVisible();
    await strip(page, "17-home-hero-stats");

    // The second screen: how-it-works with the equipment line, then the three
    // panels — which is the order §6 puts them in.
    await page.getByTestId("how-it-works").scrollIntoViewIfNeeded();
    await strip(page, "17-home-how-it-works");

    await page.getByTestId("faq-panel").scrollIntoViewIfNeeded();
    await strip(page, "17-home-community-panels");

    await signInAs(context, players.organizer);
    await page.goto("/admin/site", { waitUntil: "networkidle" });
    await strip(page, "17-admin-site");
  } finally {
    await admin.rpc("set_site_setting", {
      p_key: "active_players",
      p_value: previous.active_players ?? 0,
    });
    await admin.rpc("set_site_setting", {
      p_key: "player_of_month",
      p_value: previous.player_of_month ?? null,
    });
  }
});

// --- Phase 18 ----------------------------------------------------------------

test("the merged game surface and the player detail page", async ({ page, context }) => {
  const game = await createScratchGame({ capacity: 6, hoursFromNow: 24 * 5 });

  try {
    const runner = await apiClientFor(players.runner);
    await runner.rpc("create_booking", { p_game_id: game.id, p_payment_method: "qr" });

    await signInAs(context, players.organizer);

    // One surface: identity, payments, roster with attendance, close-out,
    // the edit form, cancel.
    await page.goto(`/admin/games/${game.id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("game-form-submit")).toBeVisible();
    await strip(page, "18-admin-game-merged");

    await page.goto(`/admin/players/${players.runner.id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("admin-player-balance")).toBeVisible();
    await strip(page, "18-admin-player-detail");
  } finally {
    await destroyScratchGame(game.id);
  }
});

// --- Phase 19 ----------------------------------------------------------------

test("the reworked stats page, at each window", async ({ page, context }) => {
  await signInAs(context, players.organizer);

  for (const [name, window] of [
    ["19-admin-stats-week", "week"],
    ["19-admin-stats-month", "month"],
  ] as const) {
    await page.goto(`/admin/stats?window=${window}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("stat-window-picker")).toBeVisible();
    await strip(page, name);
  }
});
