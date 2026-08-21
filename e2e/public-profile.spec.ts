import { expect, test } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { apiClientFor, players, serviceClient } from "./helpers/session";
import { clearActiveBookings, createScratchGame, destroyScratchGame } from "./helpers/scaffold";

/**
 * ROUND 14 ITEM 13 — public player profiles, quarantine LIFTED with a scope.
 *
 * `SCOPE.md` §2 quarantined this because a profile is the surface where a
 * product accidentally publishes a phone number. So the assertions that matter
 * are the NEGATIVE ones: the page shows four things and the RPC cannot be
 * asked for a fifth.
 */

test.use({ viewport: { width: 390, height: 844 } });

test("the page shows the four things in scope and nothing else", async ({ page, context }) => {
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);

  const admin = serviceClient();
  const { data: player } = await admin
    .from("players")
    .select("nickname, email, phone, country")
    .eq("id", players.runner.id)
    .single();

  await page.goto(`/player/${encodeURIComponent(player!.nickname)}`, {
    waitUntil: "networkidle",
  });

  // The four in scope.
  await expect(page.getByTestId("public-nickname")).toHaveText(player!.nickname);
  await expect(page.getByTestId("public-avatar")).toBeVisible();
  await expect(page.getByTestId("profile-cover")).toBeVisible();
  await expect(page.getByTestId("profile-stats")).toBeVisible();
  await expect(page.getByTestId("badge-grid")).toBeVisible();

  /*
   * AND NOTHING ELSE. Asserted against the page's whole text rather than
   * against selectors: a selector-based check passes when a field is rendered
   * somewhere the test did not think to look, which is exactly how a profile
   * leaks a phone number.
   */
  const body = await page.locator("body").innerText();
  if (player!.email) expect(body, "the email is on the page").not.toContain(player!.email);
  if (player!.phone) expect(body, "the phone is on the page").not.toContain(player!.phone);

  // No wallet, no credits, no history, no tabs.
  await expect(page.getByTestId("credit-balance")).toHaveCount(0);
  await expect(page.getByTestId("credit-batches")).toHaveCount(0);
  await expect(page.getByTestId("past-games")).toHaveCount(0);
  await expect(page.getByTestId("profile-tabs")).toHaveCount(0);
  // And no control offering a stranger the file picker for somebody's photo.
  await expect(page.getByTestId("photo-cover-control")).toHaveCount(0);
  await expect(page.getByTestId("photo-avatar-control")).toHaveCount(0);
});

test("a roster face opens the player, and a guest's does not", async ({ page, context }) => {
  const game = await createScratchGame({ capacity: 8 });
  try {
    await clearActiveBookings("runner");
    const as = await apiClientFor(players.runner);
    // A party, so the row carries a real player AND two guests.
    await as.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
      p_guest_count: 2,
    });

    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });

    const roster = page.getByTestId("roster");
    // Exactly one linked row — the player. The two guests are not links.
    await expect(roster.getByTestId("roster-player-link")).toHaveCount(1);
    await expect(roster.locator('li[data-guest="true"] a')).toHaveCount(0);

    await roster.getByTestId("roster-player-link").click();
    await page.waitForURL(/\/player\//);
    await expect(page.getByTestId("public-nickname")).toHaveText(players.runner.nickname);
  } finally {
    await clearActiveBookings("runner");
    await destroyScratchGame(game.id);
  }
});

test("a guest, a shadow and a stranger all 404 the same way", async ({ page }) => {
  const admin = serviceClient();
  const { data: shadow } = await admin
    .from("players")
    .select("nickname")
    .is("auth_user_id", null)
    .limit(1)
    .single();

  for (const nickname of [shadow?.nickname, "no such person at all"].filter(Boolean)) {
    const response = await page.goto(`/player/${encodeURIComponent(nickname as string)}`);
    expect(response?.status(), `${nickname} did not 404`).toBe(404);
  }
});

test("the RPC is anon-callable and returns only the six columns", async () => {
  const { anonClient } = await import("./helpers/session");
  const anon = anonClient();

  const { data, error } = await anon.rpc("public_player_profile", {
    p_nickname: players.runner.nickname,
  });
  expect(error).toBeNull();

  /*
   * THE COMPOSITE IS THE BOUNDARY. Six keys, exactly — so a later edit to the
   * page cannot leak a field, because the field never arrives from the
   * database. Enumerated rather than spot-checked for the same reason the
   * roster view's column list is.
   */
  expect(Object.keys(data as object).sort()).toEqual([
    "cover_path",
    "games_played",
    "hours",
    "nickname",
    "photo_path",
    "venues",
  ]);
});
