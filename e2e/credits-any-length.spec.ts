import { expect, test } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session";
import { createScratchGame, destroyScratchGame, setWalletTo, walletBalance } from "./helpers/scaffold";

/**
 * ROUND 40 — a Credit pays for a game of any length.
 *
 * ~~Round 35 v5: a credit buys a 90-minute seat; a 60-minute game is
 * online-only.~~ The owner removed the 150 CZK hour and the lawyer's terms make
 * every booking a Credit (Obchodní podmínky 5.1), so the short game is the
 * subject here precisely because it is the one that used to refuse.
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

test("a 60-minute game offers Redeem credit and books on one Credit", async ({
  page,
  context,
}) => {
  const short = await createScratchGame({ durationMinutes: 60, priceCzk: 180, hoursFromNow: 24 * 5 });
  try {
    await setWalletTo(players.creditRich.id, 3 * 180);
    await asPlayer(context, "creditRich");

    await page.goto(`/game/${short.id}/book`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("pay-credit-input")).toBeEnabled();
    await page.getByTestId("pay-credit-input").check();

    // Texty 4.1 and 4.2: the booking is described, and the commit names its cost.
    await expect(page.getByTestId("reservation-summary")).toContainText("12 hours");
    await expect(page.getByTestId("confirm-booking")).toContainText("Book for 1 Credit");

    await page.getByTestId("terms-accept").check();
    await page.getByTestId("confirm-booking").click();
    await page.waitForURL(/\/book\/confirmation\?/);

    expect(await walletBalance(players.creditRich.id)).toBe(2 * 180);
  } finally {
    await destroyScratchGame(short.id);
  }
});

test("the add-guests credit rail takes a 60-minute game too", async () => {
  const short = await createScratchGame({ durationMinutes: 60, priceCzk: 180, hoursFromNow: 24 * 3 });
  const admin = serviceClient();
  try {
    await setWalletTo(players.creditRich.id, 3 * 180);
    const client = await apiClientFor(players.creditRich);
    const made = await client.rpc("create_booking", {
      p_game_id: short.id,
      p_payment_method: "cash",
    });
    expect(made.error, `create_booking: ${made.error?.message}`).toBeNull();

    const added = await client.rpc("add_guests_with_credit", {
      p_booking_id: (made.data as { id: string }).id,
      p_guest_count: 1,
    });
    expect(added.error, `add_guests_with_credit: ${added.error?.message}`).toBeNull();
    expect(await walletBalance(players.creditRich.id)).toBe(180);

    await admin.from("bookings").delete().eq("id", (made.data as { id: string }).id);
  } finally {
    await destroyScratchGame(short.id);
  }
});

test("the pass page says what a Credit is, with no length attached", async ({ page, context }) => {
  await asPlayer(context, "runner");
  await page.goto("/pass", { waitUntil: "networkidle" });

  const line = page.getByTestId("pass-credit-unit");
  await expect(line).toBeVisible();
  await expect(line).toContainText("1 Credit = 1 place in one game");
  await expect(line).not.toContainText(/online/i);
});

test("every pass tile states sixty days", async ({ page, context }) => {
  await asPlayer(context, "runner");
  await page.goto("/pass", { waitUntil: "networkidle" });

  const tiles = page.getByTestId("pass-tier");
  const count = await tiles.count();
  expect(count, "no pass tiles rendered").toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    await expect(tiles.nth(i)).toContainText("60 days");
  }
});
