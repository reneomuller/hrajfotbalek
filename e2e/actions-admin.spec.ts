import { expect, test, type Page } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { createAccount, removeAccount, removePlayerRow } from "./helpers/accounts";
import { execAsOwner, moveKickoff } from "./helpers/clock";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session";

/**
 * ROUND 41 — "tests for every action on the platform": the admin actions no
 * spec drove until now. Each is clicked through its real control, as the
 * organizer, and its effect read back from the database.
 *
 * Players acted on are throwaway accounts; settings are restored to exactly
 * what they were; everything a test makes, it removes.
 */

test.use({ viewport: { width: 390, height: 844 } });

const CRON_SECRET = process.env.CRON_SECRET!;

test.beforeEach(async ({ context }) => {
  await signInAs(context, players.organizer);
  await context.addCookies([{ name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" }]);
});

async function playerRow(id: string) {
  const { data } = await serviceClient().from("players").select("*").eq("id", id).maybeSingle();
  return data as Record<string, unknown> | null;
}

async function siteSettings(): Promise<Record<string, unknown>> {
  const { data } = await serviceClient().from("site_settings").select("settings").eq("id", "singleton").maybeSingle();
  return ((data as { settings: Record<string, unknown> } | null)?.settings ?? {}) as Record<string, unknown>;
}

async function restoreSettings(settings: Record<string, unknown>): Promise<void> {
  await execAsOwner("update public.site_settings set settings = $1::jsonb where id = 'singleton'", [
    JSON.stringify(settings),
  ]);
}

function acceptConfirms(page: Page): void {
  page.on("dialog", (dialog) => void dialog.accept());
}

test("an admin removes a player's photo and cover", async ({ page }) => {
  // Arrange
  const account = await createAccount();
  const id = account.playerId!;
  await execAsOwner("update public.players set photo_path = $2, cover_path = $3 where id = $1::uuid", [
    id,
    `players/${id}.webp`,
    `covers/${id}.webp`,
  ]);
  acceptConfirms(page);
  try {
    await page.goto(`/admin/players/${id}`);

    // Act
    // (The "removed" markers are client state that the page's revalidation
    // can unmount before they are seen — CLAUDE.md — so the database is read.)
    await page.getByTestId("remove-photo").click();
    await expect.poll(async () => (await playerRow(id))?.photo_path).toBeNull();
    await page.goto(`/admin/players/${id}`);
    await page.getByTestId("remove-cover").click();

    // Assert
    await expect.poll(async () => (await playerRow(id))?.cover_path).toBeNull();
  } finally {
    await removeAccount(account);
  }
});

test("an admin deletes a player's account", async ({ page }) => {
  // Arrange
  const account = await createAccount();
  acceptConfirms(page);
  try {
    await page.goto(`/admin/players/${account.playerId}`);

    // Act
    await page.getByTestId("delete-player").click();

    // Assert — anonymised for the books, login gone.
    await expect.poll(async () => (await playerRow(account.playerId!))?.deleted_at).not.toBeNull();
    const row = await playerRow(account.playerId!);
    expect(row?.email).toBeNull();
    expect(String(row?.nickname)).toMatch(/^Deleted \d+$/);
    await expect
      .poll(async () => (await serviceClient().auth.admin.getUserById(account.authId)).data.user)
      .toBeNull();
  } finally {
    await removePlayerRow(account.playerId!);
    await removeAccount(account);
  }
});

test("an admin takes Credits back, with a note, after arming the button", async ({ page }) => {
  // Arrange — three Credits granted the ordinary way.
  const account = await createAccount();
  const organizer = await apiClientFor(players.organizer);
  const granted = await organizer.rpc("grant_credit", {
    p_player_id: account.playerId,
    p_delta_czk: 540,
    p_reason: "admin_grant",
    p_unmatched_payment: false,
    p_note: "round 41 e2e",
  });
  if (granted.error) throw new Error(`grant_credit: ${granted.error.message}`);
  try {
    await page.goto(`/admin/players/${account.playerId}`);

    // Act
    await page.getByTestId("remove-credit-open").click();
    await page.getByTestId("remove-amount").fill("1");
    await page.getByTestId("remove-note").fill("Taken back by e2e");
    await page.getByTestId("remove-credit-arm").click();
    // ARMING ALONE TAKES NOTHING — the bug this caught took the Credits here.
    await expect(page.getByTestId("remove-credit-submit")).toBeVisible();
    await page.waitForTimeout(1000);
    const { data: armed } = await serviceClient()
      .from("credit_ledger")
      .select("id")
      .eq("player_id", account.playerId!)
      .lt("delta_czk", 0);
    expect(armed, "arming the button removed Credits").toEqual([]);
    await page.getByTestId("remove-credit-submit").click();

    // Assert
    await expect(page.getByTestId("remove-credit-done")).toBeVisible();
    const { data: ledger } = await serviceClient()
      .from("credit_ledger")
      .select("delta_czk, note")
      .eq("player_id", account.playerId!)
      .lt("delta_czk", 0);
    expect(ledger).toEqual([{ delta_czk: -180, note: "Taken back by e2e" }]);
  } finally {
    await removeAccount(account);
  }
});

test("an admin makes a player an admin, and takes it back", async ({ page }) => {
  // Arrange
  const account = await createAccount();
  acceptConfirms(page);
  try {
    await page.goto(`/admin/players/${account.playerId}`);

    // Act / Assert — on…
    await page.getByTestId("make-admin").click();
    await expect.poll(async () => (await playerRow(account.playerId!))?.is_admin).toBe(true);

    // …and off.
    await page.goto(`/admin/players/${account.playerId}`);
    await page.getByTestId("revoke-admin").click();
    await expect.poll(async () => (await playerRow(account.playerId!))?.is_admin).toBe(false);
  } finally {
    await removeAccount(account);
  }
});

test("the site settings: games per week and the player of the month", async ({ page }) => {
  // Arrange
  const before = await siteSettings();
  const pick = players.runner.id;
  try {
    await page.goto("/admin/site");

    // Act — games per week…
    await page.getByTestId("games-per-week-input").fill("11");
    await page.getByTestId("games-per-week-submit").click();
    await expect(page.getByTestId("games-per-week-saved")).toBeVisible();

    // …and the player of the month.
    await page.getByTestId("potm-select").selectOption(pick);
    await page.getByTestId("potm-submit").click();
    await expect(page.getByTestId("potm-saved")).toBeVisible();

    // Assert
    const after = await siteSettings();
    expect(after.games_per_week).toBe(11);
    expect(after.player_of_month).toBe(pick);
  } finally {
    await restoreSettings(before);
  }
});

test("an admin creates a venue from the form", async ({ page }) => {
  // Arrange
  const name = `E2E Venue ${Date.now()}`;
  try {
    await page.goto("/admin/venues");
    const section = page.getByTestId("venue-create-section");

    // Act
    await section.locator('input[name="name"]').fill(name);
    await section.locator('input[name="mapQuery"]').fill("Letná, Praha");
    await section.getByTestId("venue-create").click();

    // Assert — the photo step appears in place, and the row exists.
    await expect(section.getByTestId("venue-create-photo")).toBeVisible();
    const { data } = await serviceClient().from("venues").select("name, map_query").eq("name", name);
    expect(data).toEqual([{ name, map_query: "Letná, Praha" }]);
  } finally {
    await execAsOwner("delete from public.venues where name = $1", [name]);
  }
});

test("an admin deletes a venue nobody has played at", async ({ page }) => {
  // Arrange
  const name = `E2E Doomed Venue ${Date.now()}`;
  const venue = await serviceClient().rpc("admin_create_venue", {
    p_name: name,
    p_image_path: null,
    p_map_query: null,
  });
  if (venue.error) throw new Error(`admin_create_venue: ${venue.error.message}`);
  const venueId = venue.data as string;
  try {
    await page.goto("/admin/venues");
    const row = page.locator(`[data-testid="venue-row"][data-venue-id="${venueId}"]`);
    await row.locator("summary").click();

    // Act
    await row.getByTestId("venue-delete").click();
    await page.getByTestId("venue-delete-confirm").click();

    // Assert
    await expect.poll(async () => (await serviceClient().from("venues").select("id").eq("id", venueId)).data).toEqual([]);
  } finally {
    await execAsOwner("delete from public.venues where id = $1::uuid", [venueId]);
  }
});

test("an admin publishes a notification and it reaches a player's bell", async ({ page, browser }) => {
  // Arrange
  const title = `E2E announcement ${Date.now()}`;
  try {
    await page.goto("/admin/site");

    // Act
    await page.getByTestId("notify-title").fill(title);
    await page.getByTestId("notify-body").fill("Pitch moved to Letná this week.");
    await page.getByTestId("notify-submit").click();
    await expect(page.getByTestId("notify-sent")).toBeVisible();

    // Assert — a player sees it.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      await signInAs(context, players.runner);
      await context.addCookies([{ name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" }]);
      const player = await context.newPage();
      await player.goto("/games");
      await player.getByTestId("notification-bell").click();
      await expect(player.getByTestId("notification-panel")).toContainText(title);
    } finally {
      await context.close();
    }
  } finally {
    await execAsOwner(
      "delete from public.user_notification_reads where notification_id in (select id from public.notifications where title = $1)",
      [title],
    );
    await execAsOwner("delete from public.notifications where title = $1", [title]);
  }
});

test("the played sweep: refused without the secret, moves a finished game with it", async ({ request }) => {
  // Arrange — a game that kicked off five hours ago.
  const game = await createScratchGame({ capacity: 10 });
  await moveKickoff(game.id, -5);
  try {
    // Act / Assert — no secret, no sweep.
    expect((await request.get("/api/cron/played")).status()).toBe(401);

    const ran = await request.get("/api/cron/played", {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(ran.status()).toBe(200);

    // Played — or straight on to settled, which auto-settle does to a game
    // with nothing owed. Either way the sweep moved it past `published`.
    const { data } = await serviceClient().from("games").select("status").eq("id", game.id).maybeSingle();
    expect(["played", "settled"]).toContain(data?.status);
  } finally {
    await destroyScratchGame(game.id);
  }
});
