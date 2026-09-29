import { expect, test } from "@playwright/test";
import { players, serviceClient, signInAs } from "./helpers/session.ts";
import {
  createScratchGame,
  destroyScratchGame,
  setWalletTo,
  type ScratchGame,
} from "./helpers/scaffold.ts";

/**
 * The terms box at the point of purchase (round 38).
 *
 * A booking is not created until the box is ticked, and the pass page carries
 * one box above its tiers for a signed-in player. The server half — both
 * actions refusing an unticked submission — is `lib/legal/terms.ts` and its
 * unit test; the pass BUY press cannot be driven here because this environment
 * has no Stripe keys and every tier renders unconfigured (REQUESTS row 356).
 */

let game: ScratchGame;

test.beforeEach(async () => {
  game = await createScratchGame();
});

test.afterEach(async () => {
  await destroyScratchGame(game.id);
});

async function bookingsOn(gameId: string, playerId: string): Promise<number> {
  const { count, error } = await serviceClient()
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("game_id", gameId)
    .eq("player_id", playerId);
  expect(error).toBeNull();
  return count ?? 0;
}

test("a booking is not made until the terms box is ticked", async ({ page, context }) => {
  // Arrange — a wallet that covers the game, so credit is preselected and
  // Confirm is live: the terms box is the only thing left in the way.
  await signInAs(context, players.runner);
  await setWalletTo(players.runner.id, game.priceCzk);
  await page.goto(`/game/${game.id}/book`);
  await expect(page.getByTestId("pay-credit-input")).toBeChecked();

  // Act — confirm without the tick.
  await page.getByTestId("confirm-booking").click();

  // Assert — still here, the box reports itself invalid, and nothing was booked.
  await expect(page).toHaveURL(new RegExp(`/game/${game.id}/book$`));
  expect(
    await page.getByTestId("terms-accept").evaluate((el) => (el as HTMLInputElement).validity.valueMissing),
  ).toBe(true);
  expect(await bookingsOn(game.id, players.runner.id)).toBe(0);

  // Act — tick it and confirm.
  await page.getByTestId("terms-accept").check();
  await page.getByTestId("confirm-booking").click();

  // Assert
  await expect(page.getByTestId("confirmation")).toBeVisible();
  expect(await bookingsOn(game.id, players.runner.id)).toBe(1);
});

test("the pass page shows one terms box to a signed-in player", async ({ page, context }) => {
  // Arrange
  await signInAs(context, players.runner);

  // Act
  await page.goto("/pass");

  // Assert — once, above the tiers, linking to the terms.
  await expect(page.getByTestId("pass-tiers")).toBeVisible();
  await expect(page.getByTestId("terms-accept")).toHaveCount(1);
  await expect(page.getByTestId("pass-terms").getByRole("link")).toHaveAttribute("href", "/terms");
});

test("the pass page shows no terms box when signed out", async ({ page }) => {
  // Arrange / Act
  await page.goto("/pass");

  // Assert — a visitor is sent to log in first and comes back to a fresh page.
  await expect(page.getByTestId("pass-tiers")).toBeVisible();
  await expect(page.getByTestId("terms-accept")).toHaveCount(0);
});
