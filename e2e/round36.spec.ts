import { expect, test } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { CREDIT_SEAT_MINUTES, priceForDurationCzk } from "../lib/games/price";
import { players, serviceClient, signInAs } from "./helpers/session";
import {
  createScratchGame,
  destroyScratchGame,
  setWalletTo,
  walletBalance,
} from "./helpers/scaffold";

/**
 * ROUND 36, ITEM 2 — THE ORGANIZER TYPES THE PRICE; THE LENGTH ONLY PREFILLS.
 *
 * Round 35 v5 made the length decide the price outright and this file is the
 * inversion. What it has to prove is not one behaviour but the SEPARATION of
 * two that were briefly one thing:
 *
 *   the PRICE is whatever was typed, and the card is charged that;
 *   ELIGIBILITY for a credit is the DURATION, and reads nothing else.
 *
 * So every fixture here is priced ACROSS the old mapping — a 90-minute game at
 * 150, a 60-minute one at 180 — because a fixture priced ON the mapping cannot
 * tell a product that reads the length from one that reads the price. Any test
 * below that passed with matching numbers would be testing a coincidence.
 */

test.use({ viewport: { width: 390, height: 844 } });

/** The prices these specs type: neither is a number the mapping can produce. */
const OFF_MAPPING_HIGH = 222;
const OFF_MAPPING_LOW = 95;

async function asAdmin(context: import("@playwright/test").BrowserContext) {
  await signInAs(context, players.organizer);
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);
}

async function fillRequiredCreateFields(page: import("@playwright/test").Page, hours: number) {
  await page.getByTestId("venue-select").selectOption({ label: "E2E Scratch Pitch" });
  await page.selectOption("#surface", "turf");
  await page
    .getByTestId("starts-at")
    .fill(new Date(Date.now() + hours * 3600_000).toISOString().slice(0, 16));
  await page.locator('input[name="capacity"]').fill("6");
}

// =============================================================================
// THE FIELD
// =============================================================================

test("the duration PREFILLS the price, and the organizer types over it", async ({
  page,
  context,
}) => {
  // Arrange
  await asAdmin(context);
  await page.goto("/admin/games/new", { waitUntil: "networkidle" });
  const price = page.getByTestId("price-czk");
  const duration = page.getByTestId("duration-minutes");

  // Act / Assert — the length moves the box.
  await duration.fill("60");
  await expect(price, "60 minutes did not prefill 150").toHaveValue("150");
  await duration.fill("90");
  await expect(price, "90 minutes did not prefill 180").toHaveValue("180");
  await duration.fill("120");
  await expect(
    price,
    "an unmapped length did not take the 90-minute prefill",
  ).toHaveValue("180");

  // And the box is the organizer's, not the mapping's.
  await price.fill(String(OFF_MAPPING_HIGH));
  await expect(price).toHaveValue(String(OFF_MAPPING_HIGH));
  await expect(price, "the price field is read-only again").toBeEditable();
});

test("CHANGING THE DURATION OVERWRITES A CUSTOMISED PRICE, on purpose", async ({
  page,
  context,
}) => {
  /*
   * THE OWNER'S CALL, PINNED SO IT CANNOT DRIFT INTO A SURPRISE.
   *
   * The alternative is a field that remembers whether its value was chosen or
   * suggested and declines to update it — a rule that is invisible on screen
   * and that nobody can predict from the outside. This way the organizer
   * retypes after changing the length, which is one visible step.
   *
   * Asserted rather than merely accepted: if a later round adds the "sticky"
   * behaviour, this test fails and somebody has to decide it deliberately.
   */
  // Arrange
  await asAdmin(context);
  await page.goto("/admin/games/new", { waitUntil: "networkidle" });
  const price = page.getByTestId("price-czk");

  await page.getByTestId("duration-minutes").fill("90");
  await price.fill(String(OFF_MAPPING_HIGH));

  // Act
  await page.getByTestId("duration-minutes").fill("60");

  // Assert
  await expect(price, "the customised price survived a duration change").toHaveValue("150");
});

test("a price of zero never leaves the form", async ({ page, context }) => {
  /*
   * POSITIVE WHOLE CROWNS, GUARDED TWICE.
   *
   * Zero became reachable the moment the field became typeable, and a game
   * priced at nothing is a booking the card rail cannot charge for — Stripe
   * refuses a zero-amount line, so the failure would otherwise land on a player
   * at checkout rather than on the organizer at the form.
   *
   * THE BROWSER STOPS IT FIRST. `min={1}` makes the submit fail constraint
   * validation, so what the organizer sees is the native bubble and the server
   * message never renders — which is why this asserts the INVALIDITY and the
   * absent navigation rather than our copy. `parseGameForm` refuses the same
   * value in `lib/admin/__tests__/gameForm.test.ts`, which is the layer that
   * answers a hand-made POST; neither guard is sufficient alone.
   */
  // Arrange
  await asAdmin(context);
  await page.goto("/admin/games/new", { waitUntil: "networkidle" });
  await fillRequiredCreateFields(page, 24 * 9);
  await page.getByTestId("duration-minutes").fill("90");
  await page.getByTestId("price-czk").fill("0");

  // Act
  await page.getByTestId("game-form-submit").click();

  // Assert — the field is reported invalid, and nothing was created.
  const invalid = await page
    .getByTestId("price-czk")
    .evaluate((el) => (el as HTMLInputElement).validity.rangeUnderflow);
  expect(invalid, "a price of 0 passed the field's own constraint").toBe(true);
  await expect(page).toHaveURL(/\/admin\/games\/new/);
});

// =============================================================================
// THE ROW, AND WHAT THE CARD IS CHARGED
// =============================================================================

test("the typed price is what the database stores and what the game page shows", async ({
  page,
  context,
}) => {
  // Arrange
  await asAdmin(context);
  await page.goto("/admin/games/new", { waitUntil: "networkidle" });
  await fillRequiredCreateFields(page, 24 * 7);
  await page.getByTestId("duration-minutes").fill("90");
  await page.getByTestId("price-czk").fill(String(OFF_MAPPING_HIGH));

  // Act
  await page.getByTestId("game-form-submit").click();
  await page.waitForURL(/\/admin\/games\/[0-9a-f-]{36}(\?|$)/);
  const gameId = new URL(page.url()).pathname.split("/").pop()!;

  try {
    // Assert — the row.
    const { data: row } = await serviceClient()
      .from("games")
      .select("price_czk, duration_minutes")
      .eq("id", gameId)
      .single();
    expect(row!.price_czk, "the row did not keep the typed price").toBe(OFF_MAPPING_HIGH);
    expect(row!.duration_minutes).toBe(CREDIT_SEAT_MINUTES);
    expect(
      row!.price_czk,
      "the fixture is priced ON the mapping, so it proves nothing",
    ).not.toBe(priceForDurationCzk(CREDIT_SEAT_MINUTES));

    // ...and the page, which is where a player meets the number.
    await page.goto(`/game/${gameId}`, { waitUntil: "networkidle" });
    expect(await page.locator("body").innerText()).toContain(String(OFF_MAPPING_HIGH));
  } finally {
    await destroyScratchGame(gameId);
  }
});

test("EDITING a price stores the new one — the length does not overrule it", async ({
  page,
  context,
}) => {
  /*
   * THE EDIT PATH IS ITS OWN FUNCTION and was its own bug: round 35 v5's
   * derive went into the seven-argument `admin_update_game`, and every edit in
   * `app/` goes through `admin_update_game_v2`. The two halves of this feature
   * have never agreed without being checked, so this drives the form.
   */
  // Arrange
  /*
   * A SURFACE, because the edit form requires one (round 16, item 10) and the
   * scaffold leaves it null. Without it the save is refused on a field this
   * test is not about, and the price simply never moves — which reads exactly
   * like the bug this test is looking for.
   */
  const game = await createScratchGame({
    durationMinutes: 90,
    priceCzk: 200,
    surface: "turf",
    hoursFromNow: 24 * 8,
  });
  await asAdmin(context);
  try {
    // The edit form lives ON the detail page; `/edit` redirects to it.
    await page.goto(`/admin/games/${game.id}`, { waitUntil: "networkidle" });
    await expect(
      page.getByTestId("price-czk"),
      "the edit form does not load the stored price",
    ).toHaveValue("200");

    // Act
    await page.getByTestId("price-czk").fill(String(OFF_MAPPING_LOW));
    await page.getByTestId("game-form-submit").click();

    // Assert — on the database, because a success marker can be revalidated away.
    await expect
      .poll(async () => {
        const { data } = await serviceClient()
          .from("games")
          .select("price_czk")
          .eq("id", game.id)
          .single();
        return data?.price_czk;
      }, { message: "the edited price never reached the row" })
      .toBe(OFF_MAPPING_LOW);
  } finally {
    await destroyScratchGame(game.id);
  }
});

// =============================================================================
// AND ELIGIBILITY STILL READS THE LENGTH
// =============================================================================

test("a 90-minute game priced BELOW the credit nominal still takes exactly one credit", async ({
  page,
  context,
}) => {
  /*
   * 150 is the SIXTY-minute prefill, so this game looks cheap and is not. If
   * anything downstream had started reading `price_czk` to decide eligibility
   * or to size the spend, it would either refuse this game or take 150 — and
   * the wallet assertion below names which.
   */
  // Arrange
  const game = await createScratchGame({
    durationMinutes: CREDIT_SEAT_MINUTES,
    priceCzk: 150,
    hoursFromNow: 24 * 4,
  });
  try {
    await setWalletTo(players.creditRich.id, 2 * 180);
    await signInAs(context, players.creditRich);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);

    // Act — through the booking form, which is where the rail is chosen.
    await page.goto(`/game/${game.id}/book`, { waitUntil: "networkidle" });
    await expect(
      page.getByTestId("pay-credit-input"),
      "a cheap 90-minute game hid the credit option",
    ).toBeEnabled();
    await page.getByTestId("pay-credit-input").check();
    await page.getByTestId("confirm-booking").click();
    await page.waitForURL(/\/book\/confirmation\?/);

    // Assert — ONE SEAT'S WORTH, not the game's price.
    expect(
      await walletBalance(players.creditRich.id),
      "a 150 CZK game charged something other than one flat credit",
    ).toBe(180);
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("a 60-minute game priced AT the credit nominal is still online-only", async ({
  page,
  context,
}) => {
  /*
   * THE MIRROR, AND THE SHARPER HALF. 180 is exactly what a credit is worth,
   * so a product that decided eligibility by comparing the price to the credit
   * nominal would offer this game — and it must not, because it is sixty
   * minutes long.
   */
  // Arrange
  const game = await createScratchGame({
    durationMinutes: 60,
    priceCzk: 180,
    hoursFromNow: 24 * 3,
  });
  try {
    await setWalletTo(players.creditRich.id, 3 * 180);
    await signInAs(context, players.creditRich);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);

    // Act
    await page.goto(`/game/${game.id}/book`, { waitUntil: "networkidle" });

    // Assert
    await expect(page.getByTestId("pay-online")).toBeVisible();
    await expect(
      page.getByTestId("pay-credit"),
      "a sixty-minute game offered a credit because its price matched the nominal",
    ).toHaveCount(0);
    expect(await page.locator("body").innerText()).toContain("180");
  } finally {
    await destroyScratchGame(game.id);
  }
});
