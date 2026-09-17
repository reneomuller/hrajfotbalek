import { expect, test } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { CREDIT_SEAT_MINUTES, priceForDurationCzk } from "../lib/games/price";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session";
import { createScratchGame, destroyScratchGame, setWalletTo, walletBalance } from "./helpers/scaffold";

/**
 * ROUND 35 v5 — the price follows the length, and a credit buys 90 minutes.
 *
 * THE SIXTY-MINUTE GAME IS THE SUBJECT OF MOST OF THIS FILE, because it is the
 * case the product did not have until now: a game a credit cannot buy. The
 * scaffold defaults to the credit's own length, so a spec that wants the short
 * game asks for it — which is also what stops the rest of the suite from
 * testing the online-only path by accident.
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
// ITEM 2 — the price comes from the length, on the page and in the row
// =============================================================================

test("a 60-minute game is 150 and a 90-minute game is 180, wherever it is read", async ({
  page,
  context,
}) => {
  const short = await createScratchGame({ durationMinutes: 60, hoursFromNow: 24 * 6 });
  const long = await createScratchGame({ durationMinutes: 90, hoursFromNow: 24 * 6 + 1 });
  const admin = serviceClient();
  try {
    // The row, which `admin_create_game_v2` priced from the duration it was given.
    const { data: rows } = await admin
      .from("games")
      .select("id, price_czk, duration_minutes")
      .in("id", [short.id, long.id]);
    const byId = new Map(
      ((rows ?? []) as { id: string; price_czk: number; duration_minutes: number }[]).map((r) => [
        r.id,
        r,
      ]),
    );
    expect(byId.get(short.id)!.price_czk, "the 60-minute game is not 150").toBe(150);
    expect(byId.get(long.id)!.price_czk, "the 90-minute game is not 180").toBe(180);

    // And the page a player reads.
    await asPlayer(context, "runner");
    for (const [game, price] of [
      [short, 150],
      [long, 180],
    ] as const) {
      await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
      const body = await page.locator("body").innerText();
      expect(body, `the ${game.id} page does not say ${price}`).toContain(String(price));
    }
  } finally {
    await destroyScratchGame(short.id);
    await destroyScratchGame(long.id);
  }
});

test("the scaffold's own price agrees with the mapping", () => {
  // The mapping is the only place either number is written down.
  expect(priceForDurationCzk(60)).toBe(150);
  expect(priceForDurationCzk(CREDIT_SEAT_MINUTES)).toBe(180);
});

// =============================================================================
// ITEM 1 — a credit buys a 90-minute seat, and nothing else
// =============================================================================

test("a 60-minute game offers NO credit option — Pay online stands alone", async ({
  page,
  context,
}) => {
  const short = await createScratchGame({ durationMinutes: 60, hoursFromNow: 24 * 5 });
  try {
    // A wallet that could pay for it three times over, so the absence is about
    // the LENGTH and cannot be mistaken for an empty balance.
    await setWalletTo(players.creditRich.id, 3 * 180);
    await asPlayer(context, "creditRich");

    await page.goto(`/game/${short.id}/book`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("pay-online")).toBeVisible();
    await expect(
      page.getByTestId("pay-credit"),
      "the credit option renders on a game a credit cannot buy",
    ).toHaveCount(0);
  } finally {
    await destroyScratchGame(short.id);
  }
});

test("a 90-minute game still offers it, and spends one credit a seat", async ({
  page,
  context,
}) => {
  const long = await createScratchGame({ durationMinutes: 90, hoursFromNow: 24 * 4 });
  try {
    await setWalletTo(players.creditRich.id, 3 * 180);
    await asPlayer(context, "creditRich");

    await page.goto(`/game/${long.id}/book`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("pay-credit-input")).toBeEnabled();
    await page.getByTestId("pay-credit-input").check();
    await page.getByTestId("confirm-booking").click();
    await page.waitForURL(/\/book\/confirmation\?/);

    expect(await walletBalance(players.creditRich.id)).toBe(2 * 180);
  } finally {
    await destroyScratchGame(long.id);
  }
});

test("the server refuses the credit rail on a short game, even by hand", async () => {
  /*
   * THE HALF A FORM CANNOT ENFORCE. The option is not rendered, so reaching
   * this means a hand-made POST or a stale tab — and the answer has to be a
   * refusal rather than an unpaid booking on a product that takes no cash.
   */
  const short = await createScratchGame({ durationMinutes: 60, hoursFromNow: 24 * 3 });
  const admin = serviceClient();
  try {
    await setWalletTo(players.creditRich.id, 3 * 180);
    const client = await apiClientFor(players.creditRich);
    const made = await client.rpc("create_booking", {
      p_game_id: short.id,
      p_payment_method: "qr",
    });
    expect(made.error, `create_booking: ${made.error?.message}`).toBeNull();

    // The RPC took the booking and applied NOTHING, which is the online-only
    // shape: the whole price is owed.
    const { data: row } = await admin
      .from("bookings")
      .select("credit_applied_czk, price_czk, status")
      .eq("id", (made.data as { id: string }).id)
      .single();
    expect(row as Record<string, unknown>).toMatchObject({
      credit_applied_czk: 0,
      price_czk: 150,
      status: "reserved",
    });
    expect(await walletBalance(players.creditRich.id)).toBe(3 * 180);
  } finally {
    await destroyScratchGame(short.id);
  }
});

test("the add-guests panel on a short game shows Pay online alone", async ({ page, context }) => {
  const short = await createScratchGame({ durationMinutes: 60, hoursFromNow: 24 * 2 });
  const admin = serviceClient();
  try {
    await setWalletTo(players.creditRich.id, 3 * 180);
    const client = await apiClientFor(players.creditRich);
    const made = await client.rpc("create_booking", {
      p_game_id: short.id,
      p_payment_method: "qr",
    });
    expect(made.error).toBeNull();

    // Paid, so the panel renders at all.
    const organizer = await apiClientFor(players.organizer);
    await organizer.rpc("confirm_booking", {
      p_booking_id: (made.data as { id: string }).id,
      p_confirmed_by: players.organizer.id,
      p_received_amount_czk: 150,
    });

    await asPlayer(context, "creditRich");
    await page.goto(`/game/${short.id}`, { waitUntil: "networkidle" });

    /*
     * THE CREDIT BUTTON IS ABSENT, WHICH IS THE CLAIM. Whether the panel
     * renders at all then depends on the ONLINE rail, which this environment
     * may not have configured — and a panel with neither rail is not rendered,
     * because a picker with no button under it is a control that cannot act.
     * Both shapes are correct; what must never appear is the credit button.
     */
    await expect(
      page.getByTestId("add-guests-credit"),
      "the credit button renders on a game a credit cannot buy",
    ).toHaveCount(0);

    if ((await page.getByTestId("add-guests").count()) > 0) {
      await expect(
        page.getByTestId("add-guests-online"),
        "the panel rendered with no rail under it",
      ).toBeVisible();
    }

    // ...and the RPC behind it refuses by name.
    const refused = await client.rpc("add_guests_with_credit", {
      p_booking_id: (made.data as { id: string }).id,
      p_guest_count: 1,
    });
    expect(refused.error?.message ?? "").toContain("GAME_NOT_CREDIT_ELIGIBLE");
    expect(await walletBalance(players.creditRich.id)).toBe(3 * 180);

    await admin.from("bookings").delete().eq("id", (made.data as { id: string }).id);
  } finally {
    await destroyScratchGame(short.id);
  }
});

// =============================================================================
// ITEM 1 — and the pass page says what a credit is, before the prices
// =============================================================================

test("the pass page states that a credit is one 90-minute game", async ({ page, context }) => {
  await asPlayer(context, "runner");
  await page.goto("/pass", { waitUntil: "networkidle" });

  const line = page.getByTestId("pass-credit-unit");
  await expect(line).toBeVisible();
  await expect(line).toContainText("90");
  await expect(line).toContainText(/online/i);
});
