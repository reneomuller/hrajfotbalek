import { expect, test, type Page } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { createScratchGame, destroyScratchGame } from "./helpers/scaffold";
import { players, serviceClient, signInAs } from "./helpers/session";

/**
 * INDOOR OR OUTDOOR, AND THE CARD THE OWNER DREW (2026-11-16): "we currently
 * have no selection of indoor or outdoor, so let's also please add that in the
 * same area we choose the surface". The card shows it in a small pill under
 * the language pill — and does not grow to make room, because the venue
 * photo's crop is pinned to the card's height.
 */
test.use({ viewport: { width: 390, height: 844 } });

async function cardBoxes(page: Page, gameId: string) {
  await page.goto("/games", { waitUntil: "networkidle" });
  const card = page.locator(`[data-testid="game-row"][data-game-id="${gameId}"]`);
  await card.scrollIntoViewIfNeeded();
  return card.evaluate((el) => {
    const box = (id: string) => el.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect() ?? null;
    return {
      card: el.getBoundingClientRect().height,
      language: box("card-language"),
      setting: box("card-setting"),
      spots: box("row-spots"),
    };
  });
}

test("the admin picks Indoor beside the surface, and the card shows it under the languages without growing", async ({
  page,
  context,
}) => {
  // Arrange — a game nobody has said indoor or outdoor for.
  const game = await createScratchGame({ hoursFromNow: 48, format: "6v6", surface: "turf" });
  try {
    await context.addCookies([{ name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" }]);
    const before = await cardBoxes(page, game.id);
    expect(before.setting, "a game with no answer draws no pill").toBeNull();

    await signInAs(context, players.organizer);
    await page.goto(`/admin/games/${game.id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("game-setting"), "the field opens unanswered").toHaveValue("");

    // Act
    await page.getByTestId("game-setting").selectOption("indoor");
    await page.getByTestId("game-form-submit").click();

    // Assert — the row, read back rather than a success marker (revalidation
    // can unmount one before it is seen).
    await expect
      .poll(async () => {
        const { data } = await serviceClient().from("games").select("indoor").eq("id", game.id).single();
        return data?.indoor;
      })
      .toBe(true);

    // The card.
    const after = await cardBoxes(page, game.id);
    const pill = page.locator(`[data-testid="game-row"][data-game-id="${game.id}"]`).getByTestId("card-setting");
    await expect(pill).toHaveAttribute("data-setting", "indoor");
    await expect(pill).toHaveText("Indoor");

    const language = after.language!;
    const setting = after.setting!;
    expect(setting.top, "under the language pill").toBeGreaterThanOrEqual(language.bottom);
    expect(
      Math.abs(setting.left + setting.width / 2 - (language.left + language.width / 2)),
      "centred under it",
    ).toBeLessThan(1);
    expect(setting.bottom, "clear of the spots figure beneath").toBeLessThanOrEqual(after.spots!.top);
    expect(Math.abs(after.card - before.card), "the card grew — the photo crop is pinned to its height").toBeLessThan(
      0.5,
    );
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("the game form will not save until indoor or outdoor is answered", async ({ page, context }) => {
  // Arrange
  const game = await createScratchGame({ hoursFromNow: 48, format: "6v6", surface: "turf" });
  try {
    await context.addCookies([{ name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" }]);
    await signInAs(context, players.organizer);
    await page.goto(`/admin/games/${game.id}`, { waitUntil: "networkidle" });

    // Act
    await page.getByTestId("game-form-submit").click();

    // Assert
    await expect(page.getByText("Pick indoor or outdoor — it shows on the game's card.")).toBeVisible();
    const { data } = await serviceClient().from("games").select("indoor").eq("id", game.id).single();
    expect(data?.indoor).toBeNull();
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("an outdoor game says so in the reader's language", async ({ page, context }) => {
  // Arrange
  const game = await createScratchGame({ hoursFromNow: 48, format: "6v6", surface: "turf" });
  try {
    await serviceClient().from("games").update({ indoor: false }).eq("id", game.id);
    await context.addCookies([{ name: LOCALE_COOKIE, value: "cs", domain: "localhost", path: "/" }]);

    // Act
    await page.goto("/games", { waitUntil: "networkidle" });

    // Assert
    const pill = page.locator(`[data-testid="game-row"][data-game-id="${game.id}"]`).getByTestId("card-setting");
    await expect(pill).toHaveAttribute("data-setting", "outdoor");
    await expect(pill).toHaveText("Venku");
  } finally {
    await destroyScratchGame(game.id);
  }
});
