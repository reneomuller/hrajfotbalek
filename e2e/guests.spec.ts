import { expect, test } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { players, serviceClient, signInAs } from "./helpers/session";
import {
  clearActiveBookings,
  createScratchGame,
  destroyScratchGame,
  resetWallet,
  setWalletTo,
} from "./helpers/scaffold";

/**
 * ROUND 11 — GUESTS, both halves.
 *
 * The SQL suite (`supabase/tests/guests_and_parties.sql`) owns the arithmetic:
 * seat counts, capacity refusals, the party ceiling, cancellation releasing
 * every seat. This file owns the two things it cannot see — that the player
 * can actually choose a party in a browser, and that the seats render as
 * guests at the END of the row with no photograph.
 *
 * SEPARATE SCRATCH GAMES PER TEST, torn down after. The seed tableau is never
 * mutated: a suite that depends on how often it has been run fails in ways
 * that cannot be reproduced.
 */

test.use({ viewport: { width: 390, height: 844 } });

const PRICE = 150;

test("a player brings two guests: one booking, one price, three seats", async ({
  page,
  context,
}) => {
  const game = await createScratchGame({ capacity: 8, priceCzk: PRICE });
  try {
    await clearActiveBookings("runner");
    await signInAs(context, players.runner);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);

    await page.goto(`/game/${game.id}/book`, { waitUntil: "networkidle" });

    // Nothing is preselected beyond "just me", and the ceiling is the policy's
    // three because this pitch has room for more than that.
    await expect(page.getByTestId("party-3")).toBeVisible();
    await page.getByTestId("party-2").click();

    // The price shown is the WHOLE party's, before anything is committed.
    await expect(page.getByTestId("party-summary")).toContainText("3 spots");
    await expect(page.getByTestId("party-summary")).toContainText("450");

    await page.getByTestId("pay-cash-input").check();
    await page.getByTestId("confirm-booking").click();
    await page.waitForURL(/\/book\/confirmation/);

    // ONE booking, priced for three, holding three seats.
    const admin = serviceClient();
    const { data: bookings } = await admin
      .from("bookings")
      .select("id, guest_count, price_czk, status")
      .eq("game_id", game.id)
      .in("status", ["reserved", "confirmed"]);

    expect(bookings).toHaveLength(1);
    expect(bookings![0].guest_count).toBe(2);
    expect(bookings![0].price_czk).toBe(PRICE * 3);

    const { data: seats } = await admin.rpc("game_seats_taken", { p_game_id: game.id });
    expect(seats).toBe(3);
  } finally {
    await clearActiveBookings("runner");
    await destroyScratchGame(game.id);
  }
});

test("the party renders as guests, last in the row and never with a photo", async ({
  page,
  context,
}) => {
  const game = await createScratchGame({ capacity: 8, priceCzk: PRICE });
  try {
    await clearActiveBookings("runner");
    await signInAs(context, players.runner);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);

    await page.goto(`/game/${game.id}/book`, { waitUntil: "networkidle" });
    await page.getByTestId("party-2").click();
    await page.getByTestId("pay-cash-input").check();
    await page.getByTestId("confirm-booking").click();
    await page.waitForURL(/\/book\/confirmation/);

    // An admin holds one house guest too, so both kinds are on one row.
    const admin = serviceClient();
    await admin.rpc("set_game_guests", { p_game_id: game.id, p_count: 1 });

    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });

    /*
     * Four seats: the player, two of theirs, one of the house's.
     *
     * ~~SCOPED TO THE NAMED LIST, because `data-guest` is on the avatar stack
     * too — the two render the same seats and MUST agree, so an unscoped
     * selector counts each guest twice.~~
     *
     * THERE IS NO STACK ANY MORE (round 16, item 5). It sat directly above
     * this list showing the same people without their names, and the
     * "must agree" clause above was the tell: two renderings that have to be
     * kept in step are one rendering too many. The scoping stays because it
     * is right either way.
     */
    await expect(page.getByTestId("roster").locator("li")).toHaveCount(4);
    await expect(page.getByTestId("roster").locator('li[data-guest="true"]')).toHaveCount(3);

    // And the removed stack has not come back to disagree with it.
    await expect(
      page.locator('[data-testid="players-list"] [data-testid="avatar"]'),
      "the roster card is drawing its players twice again",
    ).toHaveCount(0);

    // The labels are built in the app, in the reader's language.
    const text = await page.getByTestId("roster").innerText();
    expect(text).toContain("Guest 1");
    expect(text).toContain("Guest 2");

    /*
     * GUESTS LAST. Asserted as an INDEX rather than by reading the markup
     * order visually: the whole point of the sort is that the recognisable
     * half of the row stays together, and a component that re-sorted its own
     * input would make this page and the games list disagree about which
     * faces the "+N" chip swallowed.
     */
    const flags = await page
      .getByTestId("roster")
      .locator("li")
      .evaluateAll((items) => items.map((el) => el.getAttribute("data-guest") === "true"));
    expect(flags[0]).toBe(false);
    expect(flags.slice(1)).toEqual([true, true, true]);

    // No guest carries a photograph — there is no account to carry one.
    const guestPhotos = await page
      .getByTestId("roster")
      .locator('li[data-guest="true"] [data-testid="roster-avatar-photo"]')
      .count();
    expect(guestPhotos).toBe(0);
  } finally {
    await clearActiveBookings("runner");
    await destroyScratchGame(game.id);
  }
});

test("credits are offered only when the wallet covers the whole party", async ({
  page,
  context,
}) => {
  const game = await createScratchGame({ capacity: 8, priceCzk: PRICE });
  try {
    await clearActiveBookings("runner");
    await signInAs(context, players.runner);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);

    // Exactly two seats' worth. Enough for the player and one guest, and one
    // short for two — which is the boundary the rule lives on.
    await setWalletTo(players.runner.id, PRICE * 2);

    await page.goto(`/game/${game.id}/book`, { waitUntil: "networkidle" });

    // Alone: covered, and chosen by default.
    await expect(page.getByTestId("pay-credit-input")).toBeEnabled();
    await expect(page.getByTestId("pay-credit-input")).toBeChecked();

    // +1 is still covered.
    await page.getByTestId("party-1").click();
    await expect(page.getByTestId("pay-credit-input")).toBeEnabled();

    /*
     * +2 IS NOT, AND THIS IS THE ASSERTION THAT MATTERS. The option was
     * already selected when the party grew past what the wallet holds. If the
     * choice merely stayed put, Confirm would still be live and the booking
     * would go through as the `cash` that "credit" maps to — an unpaid party
     * with partial credit applied, which is exactly what the rule forbids.
     */
    await page.getByTestId("party-2").click();
    await expect(page.getByTestId("pay-credit-input")).toBeDisabled();
    await expect(page.getByTestId("pay-credit-input")).not.toBeChecked();
    await expect(page.getByTestId("confirm-booking")).toBeDisabled();

    // Coming back down re-offers it.
    await page.getByTestId("party-1").click();
    await expect(page.getByTestId("pay-credit-input")).toBeEnabled();

    // And spending it is atomic: one booking, fully covered, confirmed.
    await page.getByTestId("pay-credit-input").check();
    await page.getByTestId("confirm-booking").click();
    await page.waitForURL(/\/book\/confirmation/);

    const admin = serviceClient();
    const { data: booking } = await admin
      .from("bookings")
      .select("status, payment_method, price_czk, credit_applied_czk, guest_count")
      .eq("game_id", game.id)
      .in("status", ["reserved", "confirmed"])
      .single();

    expect(booking?.guest_count).toBe(1);
    expect(booking?.price_czk).toBe(PRICE * 2);
    expect(booking?.credit_applied_czk).toBe(PRICE * 2);
    expect(booking?.payment_method).toBe("credit");
    expect(booking?.status).toBe("confirmed");
  } finally {
    await clearActiveBookings("runner");
    await resetWallet(players.runner.id);
    await destroyScratchGame(game.id);
  }
});

test("the party control stops at the seats the pitch has left", async ({ page, context }) => {
  // Three seats total, so a lone player may bring at most two.
  const game = await createScratchGame({ capacity: 3, priceCzk: PRICE });
  try {
    await clearActiveBookings("runner");
    await signInAs(context, players.runner);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);

    await page.goto(`/game/${game.id}/book`, { waitUntil: "networkidle" });

    await expect(page.getByTestId("party-2")).toBeVisible();
    await expect(page.getByTestId("party-3")).toHaveCount(0);
    // The missing button is EXPLAINED rather than simply absent.
    await expect(page.getByTestId("party-limited")).toBeVisible();
  } finally {
    await clearActiveBookings("runner");
    await destroyScratchGame(game.id);
  }
});

test("cancelling a party releases every one of its seats", async ({ page, context }) => {
  const game = await createScratchGame({ capacity: 8, priceCzk: PRICE });
  try {
    await clearActiveBookings("runner");
    await signInAs(context, players.runner);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);

    await page.goto(`/game/${game.id}/book`, { waitUntil: "networkidle" });
    await page.getByTestId("party-2").click();
    await page.getByTestId("pay-cash-input").check();
    await page.getByTestId("confirm-booking").click();
    await page.waitForURL(/\/book\/confirmation/);

    const admin = serviceClient();
    const before = await admin.rpc("game_seats_taken", { p_game_id: game.id });
    expect(before.data).toBe(3);

    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    await page.getByTestId("cancel-booking").click();
    await page.getByTestId("cancel-dialog-confirm").click();

    // Asserted on the DATABASE, not on a client-state success marker:
    // `revalidatePath` can unmount one before it is observed.
    await expect
      .poll(async () => (await admin.rpc("game_seats_taken", { p_game_id: game.id })).data)
      .toBe(0);
  } finally {
    await clearActiveBookings("runner");
    await resetWallet(players.runner.id);
    await destroyScratchGame(game.id);
  }
});
