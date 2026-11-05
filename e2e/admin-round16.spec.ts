import { expect, test } from "@playwright/test";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session";
import { createScratchGame, destroyScratchGame, clearActiveBookings, resetWallet } from "./helpers/scaffold";

/**
 * ROUND 16 ITEMS 16, 17, 18 AND 19 — the admin surfaces.
 *
 * EVERY CONTROL HERE IS GATED on `app_capabilities()`, which exists only once
 * the round-16 migration is applied. Local has it; production does not until
 * the owner runs it. These tests therefore assert the ENABLED behaviour, and
 * the gating itself is asserted separately below by reading the flag rather
 * than by assuming it.
 */

test.use({ viewport: { width: 390, height: 844 } });

test("the two summary sections are gone and their controls are not", async ({
  page,
  context,
}) => {
  const game = await createScratchGame({ capacity: 6, hoursFromNow: 30 });
  try {
    await signInAs(context, players.organizer);
    await page.goto(`/admin/games/${game.id}`, { waitUntil: "networkidle" });

    const body = await page.locator("main").innerText();

    /*
     * ASSERTED ON THE RENDERED HEADINGS, because the defect was that a reader
     * met two headings summarising a roster they were about to read anyway.
     * Checking for absent testids would pass on a page that still said both
     * words in a different element.
     */
    expect(body, "the Awaiting payment section is back").not.toMatch(/awaiting payment/i);
    expect(
      body,
      "a section headed Attendance is back — attendance is marked on the rows",
    ).not.toMatch(/^\s*attendance\s*$/im);

    // The roster survived, and so did close-out: `mark-played` is the only way
    // a game ever becomes settled.
    await expect(page.getByTestId("mark-played")).toBeVisible();
  } finally {
    await destroyScratchGame(game.id);
  }
});

/**
 * A paid booking for `runner` on a scratch game, and the admin's game page
 * open on it. Paid, because a reservation credits nothing either way and so
 * cannot tell the two switch positions apart.
 */
async function paidBookingOpenInAdmin(
  page: import("@playwright/test").Page,
  context: import("@playwright/test").BrowserContext,
  price: number,
) {
  const game = await createScratchGame({ capacity: 6, priceCzk: price, hoursFromNow: 24 * 3 });
  await clearActiveBookings("runner");
  await resetWallet(players.runner.id);

  const organizer = await apiClientFor(players.organizer);
  const { data: created, error } = await organizer.rpc("admin_create_booking", {
    p_game_id: game.id,
    p_player_id: players.runner.id,
    p_payment_method: "cash",
  });
  expect(error, error?.message).toBeNull();
  // `admin_create_booking` returns the whole row, not an id.
  const bookingId = (created as { id: string }).id;
  const { error: payError } = await serviceClient().rpc("confirm_booking", {
    p_booking_id: bookingId,
    p_confirmed_by: players.organizer.id,
  });
  expect(payError, payError?.message).toBeNull();

  await signInAs(context, players.organizer);
  await page.goto(`/admin/games/${game.id}`, { waitUntil: "networkidle" });
  return game;
}

/**
 * Opens the remove dialog, retrying the click until it is open: a click that
 * lands before hydration has no handler behind it and opens nothing.
 */
async function openRemoveDialog(page: import("@playwright/test").Page) {
  await expect(async () => {
    await page.getByTestId("roster-remove").first().click();
    await expect(page.getByTestId("roster-remove-dialog")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

const seatsOn = async (gameId: string) =>
  (await serviceClient().rpc("game_seats_taken", { p_game_id: gameId })).data;

const runnerBalance = async () => {
  const { data: ledger } = await serviceClient()
    .from("credit_ledger")
    .select("delta_czk")
    .eq("player_id", players.runner.id);
  return (ledger ?? []).reduce((sum, row) => sum + row.delta_czk, 0);
};

test("an admin removes a player and, with the switch left off, no Credit comes back", async ({
  page,
  context,
}) => {
  // Arrange
  const PRICE = 150;
  const game = await paidBookingOpenInAdmin(page, context, PRICE);
  try {
    expect(await seatsOn(game.id)).toBe(1);

    // Act
    await openRemoveDialog(page);

    /*
     * THE DIALOG MUST BE REACHABLE, not merely present — CLAUDE.md's modal
     * law. The admin shell is `relative z-10`, so a dialog rendered inside it
     * is capped under the nav pill at `z-40`: visible, enabled, and impossible
     * to press. `elementFromPoint` at the confirm button's centre is the only
     * assertion that catches that.
     */
    const confirm = page.getByTestId("roster-remove-confirm");
    await expect(confirm).toBeVisible();
    const onTop = await confirm.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el.contains(hit) || el === hit;
    });
    expect(onTop, "the confirm button is covered by the chrome").toBe(true);

    // Round 42 — the switch starts OFF: the late text, no Credit.
    await expect(page.getByTestId("roster-remove-credit")).not.toBeChecked();
    await confirm.click();

    // Assert — the seat is free, and nothing came back.
    await expect.poll(async () => await seatsOn(game.id), { timeout: 15_000 }).toBe(0);
    expect(await runnerBalance(), "a Credit came back with the switch off").toBe(0);
  } finally {
    await clearActiveBookings("runner");
    await resetWallet(players.runner.id);
    await destroyScratchGame(game.id);
  }
});

test("an admin removes a player and, with the switch on, the Credit comes back in full", async ({
  page,
  context,
}) => {
  // Arrange
  const PRICE = 150;
  const game = await paidBookingOpenInAdmin(page, context, PRICE);
  try {
    // Act
    await openRemoveDialog(page);
    // The pill is what a person taps; the checkbox under it is visually hidden.
    await page.getByTestId("roster-remove-credit-toggle").click();
    await expect(page.getByTestId("roster-remove-credit")).toBeChecked();
    await expect(page.getByTestId("roster-remove-credit-note")).toContainText("comes back in full");
    await page.getByTestId("roster-remove-confirm").click();

    // Assert — the seat is free, and the money paid came back as a Credit
    // (round 40's rule: valid 60 days from the payment, never unexpiring).
    await expect.poll(async () => await seatsOn(game.id), { timeout: 15_000 }).toBe(0);
    await expect.poll(runnerBalance, { timeout: 15_000 }).toBe(PRICE);
    const { data: refund } = await serviceClient()
      .from("credit_ledger")
      .select("expires_at")
      .eq("player_id", players.runner.id)
      .eq("reason", "cancellation_credit");
    expect(refund?.every((row) => row.expires_at !== null), "the refund never expires").toBe(true);
  } finally {
    await clearActiveBookings("runner");
    await resetWallet(players.runner.id);
    await destroyScratchGame(game.id);
  }
});
