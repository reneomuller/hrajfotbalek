import { expect, test } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { PASS_REFERENCE_PRICE_CZK } from "../lib/pass/creditPrice";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session";
import {
  createScratchGame,
  destroyScratchGame,
  setWalletTo,
  walletBalance,
} from "./helpers/scaffold";

/**
 * ROUND 35 — the seat-denominated credits ruling, and the admin seat counts.
 *
 * THE FIXTURES ARE PRICED 180 ON PURPOSE. At 150 the ruling and the old
 * price-based debit are the same number, so a spec built on the ordinary
 * fixture would pass against either behaviour.
 */

test.use({ viewport: { width: 390, height: 844 } });

async function asPlayer(
  context: import("@playwright/test").BrowserContext,
  who: keyof typeof players,
) {
  await signInAs(context, players[who]);
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);
}

// =============================================================================
// THE RULING — one seat is one credit, whatever the card price is
// =============================================================================

test("redeeming a credit on a 180 CZK game debits exactly 150", async ({ page, context }) => {
  const game = await createScratchGame({ capacity: 12, priceCzk: 180, hoursFromNow: 24 * 14 });
  try {
    await setWalletTo(players.runner.id, 600);
    await asPlayer(context, "runner");

    await page.goto(`/game/${game.id}/book`, { waitUntil: "networkidle" });

    /*
     * THE OPTION IS OFFERED, which is half the ruling. Before it, the gate was
     * `balance >= price × seats` — 600 crowns could not "cover" a 180 CZK game
     * plus nothing, so it could, but a party of four at 720 would have been
     * refused a wallet that holds four credits.
     */
    await expect(page.getByTestId("pay-credit-input")).toBeEnabled();
    await page.getByTestId("pay-credit-input").check();
    await page.getByTestId("confirm-booking").click();
    await page.waitForURL(/\/book\/confirmation\?/);

    expect(
      await walletBalance(players.runner.id),
      "a seat on a 180 CZK game cost something other than one credit",
    ).toBe(600 - PASS_REFERENCE_PRICE_CZK);
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("a party of four is offered credit when the wallet holds four credits, not four game prices", async ({
  page,
  context,
}) => {
  /*
   * THE CASE THE OLD GATE GOT WRONG. Four seats at 180 is 720 crowns; four
   * credits is 600. A wallet holding exactly four credits could pay for this
   * party under the ruling and was refused by the old arithmetic.
   */
  const game = await createScratchGame({ capacity: 12, priceCzk: 180, hoursFromNow: 24 * 13 });
  try {
    await setWalletTo(players.runner.id, 4 * PASS_REFERENCE_PRICE_CZK);
    await asPlayer(context, "runner");

    await page.goto(`/game/${game.id}/book`, { waitUntil: "networkidle" });
    await page.getByTestId("party-3").click();
    await expect(page.getByTestId("pay-credit-input")).toBeEnabled();

    await page.getByTestId("pay-credit-input").check();
    await page.getByTestId("confirm-booking").click();
    await page.waitForURL(/\/book\/confirmation\?/);

    expect(await walletBalance(players.runner.id)).toBe(0);
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("two guests added with credit cost two credits, and removing one returns one", async ({
  page,
  context,
}) => {
  const game = await createScratchGame({ capacity: 12, priceCzk: 180, hoursFromNow: 24 * 12 });
  const admin = serviceClient();
  try {
    await setWalletTo(players.runner.id, 5 * PASS_REFERENCE_PRICE_CZK);
    const client = await apiClientFor(players.runner);
    const made = await client.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
    });
    expect(made.error, `create_booking: ${made.error?.message}`).toBeNull();
    const bookingId = (made.data as { id: string }).id;

    // One credit for the seat.
    expect(await walletBalance(players.runner.id)).toBe(4 * PASS_REFERENCE_PRICE_CZK);

    await asPlayer(context, "runner");
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    await page.getByTestId("add-guests-pick-2").click();

    // The headline is in credits, never crowns — the ruling's display half.
    await expect(page.getByTestId("add-guests-cost")).toHaveText(/2 credits/i);

    await page.getByTestId("add-guests-credit").click();
    await page.waitForURL(/\/book\/confirmation\?/);

    expect(
      await walletBalance(players.runner.id),
      "two guests on a 180 CZK game cost something other than two credits",
    ).toBe(2 * PASS_REFERENCE_PRICE_CZK);

    // ...and one of them comes back as exactly one credit.
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("cancel-guests-pick-1").click();
    await page.getByTestId("cancel-guests-submit").click();
    await page.waitForURL(/\?removed=1/);

    expect(await walletBalance(players.runner.id)).toBe(3 * PASS_REFERENCE_PRICE_CZK);

    const { data: row } = await admin
      .from("bookings")
      .select("guest_count, credit_applied_czk, price_czk")
      .eq("id", bookingId)
      .single();
    expect(row as Record<string, number>).toMatchObject({
      guest_count: 1,
      credit_applied_czk: 2 * PASS_REFERENCE_PRICE_CZK,
      price_czk: 2 * PASS_REFERENCE_PRICE_CZK,
    });
  } finally {
    await destroyScratchGame(game.id);
  }
});

// =============================================================================
// ITEM 2 — the admin counts SEATS, like every player surface
// =============================================================================

test("a booking with two guests reads 3 taken in the admin list AND the capacity readout", async ({
  page,
  context,
}) => {
  /*
   * THE OWNER'S ACCEPTANCE, ASSERTED ON BOTH SURFACES HE NAMED plus the third
   * one the audit found. Before this, all three counted BOOKING ROWS: this
   * game would have read 1/12 on every one of them while the player-facing
   * page said 9 spots left.
   */
  const game = await createScratchGame({ capacity: 12, priceCzk: 150, hoursFromNow: 24 * 11 });
  try {
    const client = await apiClientFor(players.runner);
    const made = await client.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
      p_guest_count: 2,
    });
    expect(made.error, `create_booking: ${made.error?.message}`).toBeNull();

    await asPlayer(context, "organizer");

    /*
     * 1. THE GAMES LIST, located by THIS game's own link. `.first()` would read
     * whichever row the sort happened to put on top, which is a different
     * game's number and an assertion that passes or fails by accident.
     */
    await page.goto("/admin/games", { waitUntil: "networkidle" });
    const row = page.locator(`[data-testid="admin-game-row"][data-game-id="${game.id}"]`);
    await expect(row).toHaveCount(1);
    expect(
      (await row.getByTestId("admin-game-capacity").innerText()).trim(),
      "the admin list still counts bookings, not seats",
    ).toBe("3/12");

    await page.goto(`/admin/games/${game.id}`, { waitUntil: "networkidle" });

    // 2. the capacity readout, between kick-off and price
    await expect(page.getByTestId("admin-capacity")).toHaveText("3/12");

    /*
     * 3. THE DASHBOARD, which the audit found with the same miss. It lists the
     * SIX SOONEST games, so the row is located by this game's own link rather
     * than by hoping it made the cut — a spec that depends on how many other
     * games exist is a spec that fails for reasons nobody can reproduce.
     */
    await page.goto("/admin", { waitUntil: "networkidle" });
    const dashboardRow = page.locator(
      `[data-testid="dashboard-game-row"][href="/admin/games/${game.id}"]`,
    );
    if ((await dashboardRow.count()) > 0) {
      expect(
        (await dashboardRow.getByTestId("dashboard-game-capacity").innerText()).replace(/\s/g, ""),
      ).toBe("3/12");
    }

    // And the player-facing page agrees, which is the whole point.
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("spots-left").first()).toContainText("9");

  } finally {
    await destroyScratchGame(game.id);
  }
});
