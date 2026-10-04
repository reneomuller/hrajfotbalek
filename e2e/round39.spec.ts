import { expect, test, type BrowserContext } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session";
import {
  clearActiveBookings,
  createScratchGame,
  destroyScratchGame,
  setWalletTo,
  walletBalance,
} from "./helpers/scaffold";

/**
 * ROUND 39.
 *
 * 1. The game delete guard counts OBLIGATIONS, not rows: it refuses only an
 *    upcoming game somebody is still booked on.
 * 2. A venue is ARCHIVED rather than deleted: it leaves the picker, never a
 *    game.
 */

test.use({ viewport: { width: 390, height: 844 } });

const RUN = `r39${Date.now().toString(36)}`;

async function asAdmin(context: BrowserContext) {
  await signInAs(context, players.organizer);
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);
}

async function gameExists(gameId: string): Promise<boolean> {
  const { data } = await serviceClient().from("games").select("id").eq("id", gameId).maybeSingle();
  return data !== null;
}

/** Press Delete and confirm it in the portalled dialog. */
async function pressDelete(page: import("@playwright/test").Page) {
  await page.getByTestId("game-delete").click();
  await expect(page.getByTestId("game-delete-dialog")).toBeVisible();
  await page.getByTestId("game-delete-confirm").click();
}

// =============================================================================
// ITEM 1 — DELETE
// =============================================================================

test("an empty game whose only booking was cancelled deletes", async ({ page, context }) => {
  // Arrange — a booking, then cancelled: the row stays, nobody is on the game.
  const game = await createScratchGame({ capacity: 8, hoursFromNow: 24 * 9 });
  let deleted = false;
  try {
    await clearActiveBookings("runner");
    const before = await walletBalance(players.runner.id);
    await setWalletTo(players.runner.id, 0);
    const runner = await apiClientFor(players.runner);
    const made = await runner.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
    });
    expect(made.error, `create_booking: ${made.error?.message}`).toBeNull();
    const { data: booking } = await serviceClient()
      .from("bookings")
      .select("id")
      .eq("game_id", game.id)
      .single();
    const cancelled = await runner.rpc("cancel_booking", { p_booking_id: booking!.id });
    expect(cancelled.error, `cancel_booking: ${cancelled.error?.message}`).toBeNull();
    await setWalletTo(players.runner.id, before);

    // Act
    await asAdmin(context);
    await page.goto(`/admin/games/${game.id}`, { waitUntil: "networkidle" });
    await pressDelete(page);

    // Assert
    await page.waitForURL(/\/admin\/games(\?|$)/);
    expect(await gameExists(game.id), "the stale-row game was not deleted").toBe(false);
    deleted = true;
  } finally {
    await clearActiveBookings("runner");
    if (!deleted) await destroyScratchGame(game.id);
  }
});

test("an upcoming game with one confirmed booking refuses with the cancel-first message", async ({
  page,
  context,
}) => {
  // Arrange — a PAID seat, through pay-first.
  const game = await createScratchGame({ capacity: 8, priceCzk: 180, durationMinutes: 90 });
  try {
    await clearActiveBookings("runner");
    const runner = await apiClientFor(players.runner);
    const sessionId = `cs_${RUN}_live`;
    const opened = await runner.rpc("open_checkout", {
      p_game_id: game.id,
      p_guest_count: 0,
      p_stripe_session_id: sessionId,
      p_amount_czk: 180,
    });
    expect(opened.error, `open_checkout: ${opened.error?.message}`).toBeNull();
    const settled = await serviceClient().rpc("settle_checkout_session", {
      p_stripe_session_id: sessionId,
      p_amount_czk: 180,
    });
    expect(settled.data).toBe("booked");
    const { data: rows } = await serviceClient()
      .from("bookings")
      .select("status")
      .eq("game_id", game.id);
    expect(rows?.map((r) => r.status)).toEqual(["confirmed"]);

    // Act
    await asAdmin(context);
    await page.goto(`/admin/games/${game.id}`, { waitUntil: "networkidle" });
    await page.getByTestId("game-delete").click();
    const dialog = page.getByTestId("game-delete-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog, "an upcoming game carries the past-game warning").not.toContainText(
      /past game/i,
    );
    await page.getByTestId("game-delete-confirm").click();

    // Assert
    const error = page.getByTestId("game-delete-error");
    await expect(error).toBeVisible();
    await expect(error).toContainText(/cancel it first/i);
    expect(await gameExists(game.id), "a game with a live booking was deleted").toBe(true);
  } finally {
    await clearActiveBookings("runner");
    await destroyScratchGame(game.id);
  }
});

test("a settled game deletes after a confirm that names the stats it takes", async ({
  page,
  context,
}) => {
  // Arrange — paid, aged into the past, swept to settled.
  const game = await createScratchGame({ capacity: 8, priceCzk: 180, durationMinutes: 90 });
  let deleted = false;
  try {
    await clearActiveBookings("runner");
    const runner = await apiClientFor(players.runner);
    const sessionId = `cs_${RUN}_settled`;
    await runner.rpc("open_checkout", {
      p_game_id: game.id,
      p_guest_count: 0,
      p_stripe_session_id: sessionId,
      p_amount_czk: 180,
    });
    const settledSession = await serviceClient().rpc("settle_checkout_session", {
      p_stripe_session_id: sessionId,
      p_amount_czk: 180,
    });
    expect(settledSession.data).toBe("booked");
    const aged = await serviceClient()
      .from("games")
      .update({ starts_at: new Date(Date.now() - 5 * 3_600_000).toISOString() })
      .eq("id", game.id);
    expect(aged.error, `age game: ${aged.error?.message}`).toBeNull();
    const swept = await serviceClient().rpc("advance_played_games", { p_buffer_minutes: 0 });
    expect(swept.error, `advance_played_games: ${swept.error?.message}`).toBeNull();
    const { data: row } = await serviceClient()
      .from("games")
      .select("status")
      .eq("id", game.id)
      .single();
    expect(row?.status).toBe("settled");

    // Act — open the dialog and read it before confirming.
    await asAdmin(context);
    await page.goto(`/admin/games/${game.id}`, { waitUntil: "networkidle" });
    await page.getByTestId("game-delete").click();
    const dialog = page.getByTestId("game-delete-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/past game/i);
    await expect(dialog).toContainText(/every player's stats and history/i);
    await page.getByTestId("game-delete-confirm").click();

    // Assert
    await page.waitForURL(/\/admin\/games(\?|$)/);
    expect(await gameExists(game.id), "the settled game was not deleted").toBe(false);
    deleted = true;
    const { data: bookings } = await serviceClient()
      .from("bookings")
      .select("id")
      .eq("game_id", game.id);
    expect(bookings ?? [], "its bookings outlived it").toEqual([]);
  } finally {
    await clearActiveBookings("runner");
    if (!deleted) await destroyScratchGame(game.id);
  }
});

// =============================================================================
// ITEM 2 — ARCHIVE
// =============================================================================

test("archive takes a venue out of the picker and off no game; restore puts it back", async ({
  page,
  context,
}) => {
  const venueName = `Archive Ground ${RUN}`;
  const organizer = await apiClientFor(players.organizer);
  const admin = serviceClient();

  // Arrange — a venue of its own, and a game at it.
  const { data: venueId, error: venueError } = await organizer.rpc("admin_create_venue", {
    p_name: venueName,
    p_map_query: null,
    p_map_url: null,
  });
  expect(venueError, `admin_create_venue: ${venueError?.message}`).toBeNull();
  const { data: gameId, error: gameError } = await organizer.rpc("admin_create_game_v2", {
    p_venue_id: venueId,
    p_starts_at: new Date(Date.now() + 24 * 12 * 3_600_000).toISOString(),
    p_capacity: 10,
    p_price_czk: 180,
    p_organizer_name: "E2E Organizer",
    p_format: null,
    p_surface: null,
    p_notes: null,
    p_organizer_phone: null,
    p_duration_minutes: 90,
    p_allowed_skill_levels: null,
    p_subs_per_team: null,
  });
  expect(gameError, `admin_create_game_v2: ${gameError?.message}`).toBeNull();
  await organizer.rpc("publish_game", { p_game_id: gameId });

  const pickerOptions = async () => {
    await page.goto("/admin/games/new", { waitUntil: "networkidle" });
    return page.getByTestId("venue-select").locator("option").allTextContents();
  };

  try {
    await asAdmin(context);
    expect(await pickerOptions(), "the new venue is not in the picker to begin with").toContain(
      venueName,
    );

    // Act — archive from the venues page.
    await page.goto("/admin/venues", { waitUntil: "networkidle" });
    const row = page.locator(`[data-testid="venue-row"][data-venue-id="${venueId}"]`);
    await row.getByTestId("venue-summary").click();
    await expect(
      row.getByTestId("venue-delete"),
      "a venue with games must offer archive, not delete",
    ).toHaveCount(0);
    await row.getByTestId("venue-archive").click();

    // Assert — it moved to the collapsed archive.
    const archivedRow = page.locator(
      `[data-testid="venue-archived-row"][data-venue-id="${venueId}"]`,
    );
    await expect(archivedRow).toHaveCount(1, { timeout: 15_000 });
    await expect(row).toHaveCount(0);
    const { data: stamped } = await admin
      .from("venues")
      .select("archived_at")
      .eq("id", venueId)
      .single();
    expect(stamped?.archived_at, "archived_at was not set").toBeTruthy();

    // Gone from the new-game picker…
    expect(await pickerOptions(), "an archived venue is still offered").not.toContain(venueName);

    // …but its own game's edit form still holds it, so the form never opens unset.
    await page.goto(`/admin/games/${gameId}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("venue-select")).toHaveValue(venueId as string);

    // The player's game page still names it.
    await page.goto(`/game/${gameId}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("game-hero")).toContainText(venueName);

    // And the admin list, sorted by venue, still carries the game.
    await page.goto("/admin/games?sort=venue", { waitUntil: "networkidle" });
    await expect(page.getByTestId("games-sort-venue")).toHaveAttribute("aria-current", "true");
    await expect(page.locator(`a[href="/admin/games/${gameId}"]`).first()).toBeVisible();

    // Act — restore.
    await page.goto("/admin/venues", { waitUntil: "networkidle" });
    await page.getByTestId("venues-archived-summary").click();
    await archivedRow.getByTestId("venue-restore").click();
    await expect(row).toHaveCount(1, { timeout: 15_000 });

    // Assert — back in the picker.
    expect(await pickerOptions(), "a restored venue is missing from the picker").toContain(
      venueName,
    );
  } finally {
    await destroyScratchGame(gameId as string);
    await admin.from("events").delete().contains("metadata", { venue_id: venueId });
    await admin.from("venues").delete().eq("id", venueId);
  }
});
