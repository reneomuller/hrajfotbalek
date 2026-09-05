import { expect, test } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session";
import { createScratchGame, destroyScratchGame, setWalletTo } from "./helpers/scaffold";

/**
 * ROUND 26 — PAY FIRST.
 *
 * These replace round 25's item-1 tests. That round made an unpaid seat
 * anonymous; this one removed the unpaid seat, so the assertions get stronger
 * rather than disappearing: there is nothing to anonymise because there is
 * nothing there.
 *
 * THE STRIPE HALF IS NOT DRIVEN HERE. Creating a real Checkout Session needs a
 * secret key this environment does not have, so the register is written
 * directly and `settle_checkout_session` — which is where every decision in
 * this architecture is made — is called the way the webhook calls it. What
 * that skips is Stripe's own form; what it exercises is all of ours.
 */

test.use({ viewport: { width: 390, height: 844 } });

/** The webhook's call, exactly. */
async function settle(stripeSessionId: string, amountCzk: number) {
  const { data, error } = await serviceClient().rpc("settle_checkout_session", {
    p_stripe_session_id: stripeSessionId,
    p_amount_czk: amountCzk,
  });
  expect(error, `settle_checkout_session: ${error?.message}`).toBeNull();
  return data as string;
}

/** What `/payment/checkout` writes when it puts a form on screen. */
async function openCheckout(
  who: (typeof players)[keyof typeof players],
  gameId: string,
  sessionId: string,
  amountCzk: number,
  guests = 0,
) {
  const client = await apiClientFor(who);
  const { error } = await client.rpc("open_checkout", {
    p_game_id: gameId,
    p_guest_count: guests,
    p_stripe_session_id: sessionId,
    p_amount_czk: amountCzk,
  });
  expect(error, `open_checkout: ${error?.message}`).toBeNull();
}

async function seatsTaken(gameId: string) {
  const { data } = await serviceClient().rpc("game_seats_taken", { p_game_id: gameId });
  return data as number;
}

const RUN = Date.now().toString(36);

/* ============================================================================
 * The shopper takes nothing
 * ========================================================================== */

test("an open checkout takes no seat, makes no booking and names nobody", async ({
  page,
  context,
}) => {
  const game = await createScratchGame({ capacity: 8, priceCzk: 150 });

  try {
    await openCheckout(players.runner, game.id, `cs_${RUN}_shopper`, 150);

    /*
     * THE WHOLE POINT, IN THREE ASSERTIONS. Round 25 had to make a held seat
     * anonymous; there is no held seat to anonymise now, which is the stronger
     * property and the reason the machinery could be deleted rather than
     * patched.
     */
    expect(await seatsTaken(game.id), "a shopper took a seat").toBe(0);

    const { data: bookings } = await serviceClient()
      .from("bookings")
      .select("id")
      .eq("game_id", game.id);
    expect(bookings ?? [], "a booking existed before any money did").toHaveLength(0);

    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("players-list")).not.toContainText(
      players.runner.nickname,
    );
  } finally {
    await destroyScratchGame(game.id);
  }
});

/* ============================================================================
 * The webhook creates the booking
 * ========================================================================== */

test("the webhook creates a paid booking, and the player is named on the roster", async ({
  page,
  context,
}) => {
  const game = await createScratchGame({ capacity: 8, priceCzk: 150 });

  try {
    await openCheckout(players.runner, game.id, `cs_${RUN}_paid`, 150);
    expect(await settle(`cs_${RUN}_paid`, 150)).toBe("booked");

    const { data } = await serviceClient()
      .from("bookings")
      .select("status, payment_method, price_czk, guest_count, stripe_session_id")
      .eq("game_id", game.id)
      .single();
    const booking = data as {
      status: string;
      price_czk: number;
      stripe_session_id: string | null;
    };

    // CONFIRMED ON ARRIVAL. There is no reserved-then-confirmed dance any
    // more: the money came first, so the booking is born paid.
    expect(booking.status).toBe("confirmed");
    expect(booking.price_czk).toBe(150);
    expect(booking.stripe_session_id).toBe(`cs_${RUN}_paid`);
    expect(await seatsTaken(game.id)).toBe(1);

    /*
     * AND NOW THEY ARE NAMED — the other half of round 25's fix, which pay-first
     * has to keep true rather than inherit. A paid player belongs on the
     * roster.
     */
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("players-list")).toContainText(
      players.runner.nickname,
    );

    // REDELIVERY IS A NO-OP. Stripe is at-least-once.
    expect(await settle(`cs_${RUN}_paid`, 150)).toBe("already");
    expect(await seatsTaken(game.id), "a redelivery booked a second seat").toBe(1);
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("a party pays for every seat and takes every seat", async () => {
  const game = await createScratchGame({ capacity: 8, priceCzk: 150 });

  try {
    // Three seats at 150 — the amount `/payment/checkout` computes server-side,
    // which is what deleted the set-the-quantity-yourself instruction.
    await openCheckout(players.runner, game.id, `cs_${RUN}_party`, 450, 2);
    expect(await settle(`cs_${RUN}_party`, 450)).toBe("booked");

    expect(await seatsTaken(game.id), "the party did not take three seats").toBe(3);

    const { data } = await serviceClient()
      .from("bookings")
      .select("guest_count, price_czk")
      .eq("game_id", game.id)
      .single();
    expect((data as { guest_count: number }).guest_count).toBe(2);
    expect((data as { price_czk: number }).price_czk).toBe(450);
  } finally {
    await destroyScratchGame(game.id);
  }
});

/* ============================================================================
 * The race
 * ========================================================================== */

test("the game filling names every other checkout for active expiry", async () => {
  const game = await createScratchGame({ capacity: 1, priceCzk: 150 });

  try {
    await openCheckout(players.runner, game.id, `cs_${RUN}_first`, 150);
    await openCheckout(players.creditRich, game.id, `cs_${RUN}_second`, 150);

    // NOTHING TO EXPIRE while there is room.
    const admin = serviceClient();
    const before = await admin.rpc("checkouts_to_expire", { p_game_id: game.id });
    expect((before.data ?? []) as unknown[], "a checkout was doomed too early").toHaveLength(0);

    expect(await settle(`cs_${RUN}_first`, 150)).toBe("booked");

    /*
     * THE PRIMARY DEFENCE. The game is full, so the other form must die at
     * Stripe before its card is charged — this is the list the application
     * expires, and the credit path below is only for what it cannot reach in
     * time.
     */
    const after = await admin.rpc("checkouts_to_expire", { p_game_id: game.id });
    const doomed = (after.data ?? []) as { stripe_session_id: string }[];
    expect(doomed).toHaveLength(1);
    expect(doomed[0]!.stripe_session_id).toBe(`cs_${RUN}_second`);
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("a payment that lands after the game filled is credited in full, not seated", async () => {
  const game = await createScratchGame({ capacity: 1, priceCzk: 150 });

  try {
    const admin = serviceClient();
    await setWalletTo(players.creditRich.id, 0);

    /*
     * COUNTED BEFORE, NOT ASSERTED ABSOLUTELY. Notifications are not torn down
     * by `destroyScratchGame` — nothing deletes a message somebody was sent —
     * so a second run of this suite finds the first run's warning still there.
     * The claim is "this payment produced one", which is a delta.
     */
    const { count: toldBefore } = await admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", players.creditRich.id)
      .eq("kind", "checkout_game_full");

    await openCheckout(players.runner, game.id, `cs_${RUN}_won`, 150);
    await openCheckout(players.creditRich, game.id, `cs_${RUN}_lost`, 150);

    expect(await settle(`cs_${RUN}_won`, 150)).toBe("booked");

    // The residual: they complete inside the same instant, past active expiry.
    expect(await settle(`cs_${RUN}_lost`, 150)).toBe("credited");

    // NOTHING IS OVERSOLD.
    expect(await seatsTaken(game.id), "the game was oversold").toBe(1);

    // THE MONEY IS THEIRS, IN FULL — refund-in-kind, the only refund path.
    const { data: ledger } = await admin
      .from("credit_ledger")
      .select("delta_czk")
      .eq("player_id", players.creditRich.id);
    const balance = ((ledger ?? []) as { delta_czk: number }[]).reduce(
      (sum, row) => sum + row.delta_czk,
      0,
    );
    expect(balance, "the loser of the race was not credited in full").toBe(150);

    // THEY ARE TOLD, and the admin has an entry to look at.
    const { count: toldAfter } = await admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", players.creditRich.id)
      .eq("kind", "checkout_game_full");
    expect(
      (toldAfter ?? 0) - (toldBefore ?? 0),
      "the credited player was not told exactly once",
    ).toBe(1);

    const { data: attention } = await admin
      .from("checkout_sessions")
      .select("attention_at, status")
      .eq("stripe_session_id", `cs_${RUN}_lost`)
      .single();
    expect((attention as { status: string }).status).toBe("credited");
    expect(
      (attention as { attention_at: string | null }).attention_at,
      "the credited checkout is not in the needs-attention queue",
    ).not.toBeNull();
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("a credit redemption filling the game dooms the open checkouts too", async () => {
  const game = await createScratchGame({ capacity: 1, priceCzk: 150 });

  try {
    await openCheckout(players.runner, game.id, `cs_${RUN}_rail2`, 150);

    // RAIL 2: somebody pays with wallet credit and takes the last seat.
    await setWalletTo(players.creditRich.id, 150);
    const client = await apiClientFor(players.creditRich);
    const { error } = await client.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
    });
    expect(error).toBeNull();

    const { data } = await serviceClient().rpc("checkouts_to_expire", {
      p_game_id: game.id,
    });
    expect(
      (data ?? []) as unknown[],
      "a credit redemption filled the game and doomed nobody",
    ).toHaveLength(1);
  } finally {
    await destroyScratchGame(game.id);
  }
});

/* ============================================================================
 * The machinery that went
 * ========================================================================== */

test("nothing renders an awaiting-payment state any more", async ({ page, context }) => {
  const game = await createScratchGame({ capacity: 8, priceCzk: 150 });

  try {
    await openCheckout(players.runner, game.id, `cs_${RUN}_gone`, 150);
    expect(await settle(`cs_${RUN}_gone`, 150)).toBe("booked");

    await signInAs(context, players.runner);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });

    /*
     * THE ASSERTION INVERTS RATHER THAN DISAPPEARING. `awaiting-payment` was
     * round 12's panel for a booking whose money had not arrived; pay-first
     * cannot produce that row, so the panel is gone and this is the spec that
     * fails if somebody rebuilds it.
     */
    await expect(page.getByTestId("awaiting-payment")).toHaveCount(0);
    await expect(page.getByTestId("your-booking")).toBeVisible();
  } finally {
    await destroyScratchGame(game.id);
  }
});
