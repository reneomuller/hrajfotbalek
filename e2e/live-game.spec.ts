import { expect, test } from "@playwright/test";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold";
import { moveKickoff } from "./helpers/clock";
import { apiClientFor, players, signInAs } from "./helpers/session";

/**
 * A GAME IS ON UNTIL ITS FINAL WHISTLE (the owner, 2026-11-09): "currently the
 * game cards/pills dissapear as soon as the game starts. once a game starts, i
 * would like the 'x spots left' to change into a pill like we have '7v7' or
 * '6v6' in orange. the game should dissapear for the user only after it has
 * finished (a game from 18:00-19:30 would dissapear from view at 19:30 and get
 * marked as played automatically)".
 */

/**
 * How long ago the "live" game kicked off, in minutes — at most twenty, and
 * never across Prague midnight, where the list's day window would drop it for
 * a reason that has nothing to do with this spec.
 */
function minutesIntoPragueDay(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return read("hour") * 60 + read("minute");
}
const LIVE_MINUTES_AGO = Math.min(20, Math.max(1, minutesIntoPragueDay() - 1));

test("a game that has kicked off stays on the list, with an orange Playing now pill instead of spots left", async ({
  page,
}) => {
  // Arrange — ninety minutes long, kicked off a few minutes ago.
  const game = await createScratchGame({ durationMinutes: 90 });
  try {
    await moveKickoff(game.id, -LIVE_MINUTES_AGO / 60);

    // Act
    await page.goto("/games");
    const card = page.locator(`[data-testid='game-row'][data-game-id='${game.id}']`);

    // Assert
    await expect(card).toBeVisible();
    await expect(card.getByTestId("card-live")).toBeVisible();
    await expect(card.getByTestId("card-live")).toHaveClass(/border-warn/);
    await expect(card.getByTestId("card-join-cue")).toHaveCount(0);
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("a game whose final whistle has gone is off the list", async ({ page }) => {
  // Arrange — kicked off two hours ago, ninety minutes long.
  const game = await createScratchGame({ durationMinutes: 90 });
  try {
    await moveKickoff(game.id, -2);

    // Act
    await page.goto("/games");
    await expect(page.getByTestId("game-list").or(page.getByTestId("empty-state-cta")).first()).toBeVisible();

    // Assert
    await expect(page.locator(`[data-testid='game-row'][data-game-id='${game.id}']`)).toHaveCount(0);
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("a player's next game stays at the top while it is on, marked Playing now", async ({ page, context }) => {
  // Arrange — booked before kick-off, as a player would be.
  const game = await createScratchGame({ durationMinutes: 90, hoursFromNow: 24 });
  try {
    const runner = await apiClientFor(players.runner);
    const { error } = await runner.rpc("create_booking", { p_game_id: game.id, p_payment_method: "cash" });
    expect(error).toBeNull();
    await moveKickoff(game.id, -LIVE_MINUTES_AGO / 60);
    await signInAs(context, players.runner);

    // Act
    await page.goto("/games");

    // Assert
    await expect(page.getByTestId("next-game-strip")).toBeVisible();
    await expect(page.getByTestId("next-game-live")).toBeVisible();
  } finally {
    await destroyScratchGame(game.id);
  }
});
