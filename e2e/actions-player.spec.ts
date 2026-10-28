import { expect, test } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { execAsOwner } from "./helpers/clock";
import { createScratchGame, destroyScratchGame, type ScratchGame } from "./helpers/scaffold";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session";

/**
 * ROUND 41 — "tests for every action on the platform": the player actions no
 * spec drove until now — leaving a waitlist, Clear all in the bell, and the
 * two RESUME paths that finish what somebody started before signing in.
 */

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ context }) => {
  await signInAs(context, players.runner);
  await context.addCookies([{ name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" }]);
});

/** A capacity-2 game filled by two other players, so it takes waitlist joins. */
async function fullGame(): Promise<ScratchGame> {
  const game = await createScratchGame({ capacity: 2 });
  for (const player of [players.organizer, players.seedBot] as const) {
    const session = await apiClientFor(player);
    const { error } = await session.rpc("create_booking", { p_game_id: game.id, p_payment_method: "cash" });
    if (error) throw new Error(`fill ${player.nickname}: ${error.message}`);
  }
  return game;
}

async function onWaitlist(gameId: string): Promise<boolean> {
  const { data } = await serviceClient()
    .from("waitlist")
    .select("id")
    .eq("game_id", gameId)
    .eq("player_id", players.runner.id);
  return (data ?? []).length > 0;
}

test("a player leaves a waitlist they joined", async ({ page }) => {
  // Arrange
  const game = await fullGame();
  try {
    await page.goto(`/game/${game.id}`);
    await page.getByTestId("join-waitlist").click();
    await expect.poll(() => onWaitlist(game.id)).toBe(true);
    await page.goto(`/game/${game.id}`);

    // Act
    await page.getByTestId("leave-waitlist").click();

    // Assert — on the server's next render, not on the client-state marker,
    // which `revalidatePath` can unmount before it is seen (CLAUDE.md).
    await expect.poll(() => onWaitlist(game.id)).toBe(false);
    await page.goto(`/game/${game.id}`);
    await expect(page.getByTestId("join-waitlist")).toBeVisible();
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("Clear all empties the bell, and it stays empty", async ({ page }) => {
  // Arrange — something in the bell.
  const organizer = await apiClientFor(players.organizer);
  const made = await organizer.rpc("admin_create_notification", {
    p_title: `Clear me ${Date.now()}`,
    p_body: "Round 41 e2e",
  });
  if (made.error) throw new Error(`admin_create_notification: ${made.error.message}`);
  const id = made.data as string;
  // Clear all writes a dismissal for EVERY notification this reader can see;
  // remember the runner's bell exactly as it was, to put it back.
  const { data: before } = await serviceClient()
    .from("user_notification_reads")
    .select("notification_id, dismissed_at")
    .eq("player_id", players.runner.id);
  try {
    await page.goto("/games");
    await page.getByTestId("notification-bell").click();
    await expect(page.locator(`[data-notification-id="${id}"]`)).toBeVisible();

    // Act
    await page.getByTestId("notifications-clear").click();

    // Assert
    await expect(page.getByTestId("notification-empty")).toBeVisible();
    await page.reload();
    await page.getByTestId("notification-bell").click();
    await expect(page.getByTestId("notification-empty")).toBeVisible();
  } finally {
    await execAsOwner("delete from public.user_notification_reads where notification_id = $1::uuid", [id]);
    await execAsOwner("delete from public.notifications where id = $1::uuid", [id]);
    const snapshot = JSON.stringify(before ?? []);
    await execAsOwner(
      `delete from public.user_notification_reads r
        where r.player_id = $1::uuid
          and r.notification_id not in (
            select (e->>'notification_id')::uuid from jsonb_array_elements($2::jsonb) e)`,
      [players.runner.id, snapshot],
    );
    await execAsOwner(
      `update public.user_notification_reads r
          set dismissed_at = (e->>'dismissed_at')::timestamptz
         from jsonb_array_elements($2::jsonb) e
        where r.player_id = $1::uuid and r.notification_id = (e->>'notification_id')::uuid`,
      [players.runner.id, snapshot],
    );
  }
});

test("signing in to join a waitlist finishes the join", async ({ page }) => {
  // Arrange — the intent a signed-out visitor carried through the login.
  const game = await fullGame();
  try {
    // Act
    await page.goto(`/game/${game.id}?resume=join_waitlist`);

    // Assert
    await expect.poll(() => onWaitlist(game.id)).toBe(true);
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("signing in to book with a stated method finishes the booking", async ({ page }) => {
  // Arrange
  const game = await createScratchGame({ capacity: 10 });
  try {
    // Act
    await page.goto(`/game/${game.id}/book?resume=book&method=cash`);

    // Assert — straight to the confirmation, and the booking exists.
    await page.waitForURL(/\/book\/confirmation\?booking=/);
    const { data } = await serviceClient()
      .from("bookings")
      .select("status")
      .eq("game_id", game.id)
      .eq("player_id", players.runner.id);
    expect(data).toHaveLength(1);
  } finally {
    await destroyScratchGame(game.id);
  }
});
