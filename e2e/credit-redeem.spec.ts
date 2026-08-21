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
 * ROUND 13 ITEM 23 — redeeming credit, driven the whole way through a browser.
 *
 * THIS SPEC EXISTS BECAUSE THE FLOW BROKE IN PRODUCTION AND NOTHING FAILED.
 * "Redeem credit" is the one booking path with no e2e behind it: the payment
 * chooser had specs for which options RENDER, the SQL suite had specs for what
 * `create_booking` DERIVES, and between them sat the actual button.
 *
 * So this drives the button — sign in, pick the option, press Confirm, and
 * assert on the ROW, not on a client-state marker that `revalidatePath` can
 * unmount before it is read.
 */

test.use({ viewport: { width: 390, height: 844 } });

const PRICE = 150;

test("a player with a covering balance redeems credit and is confirmed", async ({
  page,
  context,
}) => {
  const game = await createScratchGame({ capacity: 8, priceCzk: PRICE });
  try {
    await clearActiveBookings("runner");
    await setWalletTo(players.runner.id, PRICE);
    await signInAs(context, players.runner);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);

    await page.goto(`/game/${game.id}/book`, { waitUntil: "networkidle" });

    // Covered, so the option is live and preselected.
    const credit = page.getByTestId("pay-credit-input");
    await expect(credit).toBeEnabled();
    await expect(credit).toBeChecked();

    await page.getByTestId("confirm-booking").click();
    await page.waitForURL(/\/book\/confirmation/, { timeout: 15000 });

    const admin = serviceClient();
    const { data: booking } = await admin
      .from("bookings")
      .select("status, payment_method, price_czk, credit_applied_czk, payment_pending_at")
      .eq("game_id", game.id)
      .in("status", ["reserved", "confirmed"])
      .single();

    expect(booking?.payment_method, "the RPC derives credit").toBe("credit");
    expect(booking?.status, "a fully covered booking is confirmed at once").toBe("confirmed");
    expect(booking?.credit_applied_czk).toBe(PRICE);
    expect(
      booking?.payment_pending_at,
      "a credit booking is never on the online-payment clock",
    ).toBeNull();

    /*
     * The wallet actually moved — and SCOPED TO THIS BOOKING, because the seed
     * player carries historical redemptions from every other spec that has
     * ever run. An unscoped count asserts how many times the suite has been
     * run, which is the failure mode CLAUDE.md warns about by name.
     */
    const { data: bookingRow } = await admin
      .from("bookings")
      .select("id")
      .eq("game_id", game.id)
      .in("status", ["reserved", "confirmed"])
      .single();
    const { data: ledger } = await admin
      .from("credit_ledger")
      .select("delta_czk")
      .eq("booking_id", bookingRow!.id)
      .lt("delta_czk", 0);
    expect(ledger, "one redemption for this booking, not zero and not two").toHaveLength(1);
    expect(ledger![0].delta_czk).toBe(-PRICE);
  } finally {
    await clearActiveBookings("runner");
    await resetWallet(players.runner.id);
    await destroyScratchGame(game.id);
  }
});

test("a party paid entirely in credit spends one credit per seat", async ({ page, context }) => {
  const game = await createScratchGame({ capacity: 8, priceCzk: PRICE });
  try {
    await clearActiveBookings("runner");
    await setWalletTo(players.runner.id, PRICE * 3);
    await signInAs(context, players.runner);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);

    await page.goto(`/game/${game.id}/book`, { waitUntil: "networkidle" });
    await page.getByTestId("party-2").click();
    await expect(page.getByTestId("pay-credit-input")).toBeEnabled();
    await page.getByTestId("pay-credit-input").check();
    await page.getByTestId("confirm-booking").click();
    await page.waitForURL(/\/book\/confirmation/, { timeout: 15000 });

    const admin = serviceClient();
    const { data: booking } = await admin
      .from("bookings")
      .select("status, payment_method, price_czk, credit_applied_czk, guest_count")
      .eq("game_id", game.id)
      .in("status", ["reserved", "confirmed"])
      .single();

    expect(booking?.guest_count).toBe(2);
    expect(booking?.price_czk).toBe(PRICE * 3);
    expect(booking?.credit_applied_czk).toBe(PRICE * 3);
    expect(booking?.payment_method).toBe("credit");
    expect(booking?.status).toBe("confirmed");
  } finally {
    await clearActiveBookings("runner");
    await resetWallet(players.runner.id);
    await destroyScratchGame(game.id);
  }
});
