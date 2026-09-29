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
 * A CARD payment accepts the terms inside Stripe's embedded form, directly
 * above Pay — `lib/payments/termsConsent.ts`, unit-tested, because this
 * environment has no Stripe keys and cannot render the form. What CAN be
 * driven here is the path Stripe never sees: a CREDIT booking completes on our
 * page, so it carries our own box, and nothing else does.
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

test("paying online shows no terms box here — Stripe asks above Pay", async ({
  page,
  context,
}) => {
  // Arrange — no credit, so online is the only way to pay.
  await signInAs(context, players.runner);
  await setWalletTo(players.runner.id, 0);
  await page.goto(`/game/${game.id}/book`);

  // Act
  await page.getByTestId("pay-online-input").check();

  // Assert
  await expect(page.getByTestId("terms-accept")).toHaveCount(0);
});

test("the pass page carries no terms box of its own", async ({ page, context }) => {
  // Arrange
  await signInAs(context, players.runner);

  // Act
  await page.goto("/pass");

  // Assert — every pass is paid by card, so the terms are Stripe's to ask.
  await expect(page.getByTestId("pass-tiers")).toBeVisible();
  await expect(page.getByTestId("terms-accept")).toHaveCount(0);
});
