import { expect, test } from "@playwright/test";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session.ts";
import {
  createScratchGame,
  destroyScratchGame,
  setWalletTo,
  walletBalance,
  type ScratchGame,
} from "./helpers/scaffold.ts";

/**
 * Criterion 1 — book to a scannable QR in under 60 seconds on a phone.
 * Criterion 7 — credit auto-applies, both in full and in part.
 *
 * Every spec here builds its own game so the seeded tableau is never disturbed
 * and the suite is re-runnable; see e2e/helpers/scaffold.ts.
 */

let game: ScratchGame;

test.beforeEach(async () => {
  game = await createScratchGame();
});

test.afterEach(async () => {
  await destroyScratchGame(game.id);
});

/*
 * ROUND 7 ITEM 10 CHANGED WHAT THIS FLOW OFFERS, not how fast it is.
 *
 * The UI's two options are now ONLINE and CASH; QR is retired from the
 * booking screens and survives as the rail online books onto (ruling R3).
 * With `NEXT_PUBLIC_STRIPE_PAYMENT_URL` unset — the state this suite runs in
 * and the state production ships in — cash is the selectable option, so that
 * is what the timing criterion is measured through.
 *
 * The QR SCREEN keeps its own coverage further down, driven through the rail
 * rather than through a control the UI no longer has.
 */
test("book to a confirmed spot in under 60 seconds", async ({ page, context }) => {
  await signInAs(context, players.runner);
  await setWalletTo(players.runner.id, 0);

  // The clock starts where the player's does: on the game page, having decided
  // to play. Sixty seconds is the criterion, and it is measured against the
  // real database — no mocked RPCs, no pre-warmed route.
  const started = Date.now();

  await page.goto(`/game/${game.id}`);
  await page.getByTestId("book-cta").click();

  // NOTHING IS PRESELECTED (item 10), so the choice is part of the measured
  // flow rather than a default the player never sees.
  await expect(page.getByTestId("confirm-booking")).toBeDisabled();
  await page.getByTestId("pay-cash-input").check();
  await page.getByTestId("confirm-booking").click();

  await expect(page.getByTestId("confirmation")).toBeVisible();

  const elapsedSeconds = (Date.now() - started) / 1000;
  expect(elapsedSeconds).toBeLessThan(60);

  // NO QR ON A CASH BOOKING, which is item 10's visible half: the player
  // chose to pay on the pitch and a code asking them to transfer money would
  // be a second, contradictory instruction. The QR renderer's own assertions
  // moved to the rail test at the bottom of this file.
  await expect(page.getByTestId("qr-payment")).toHaveCount(0);
  // `fallback-account` is part of the QR block and goes with it. What must
  // survive is the AMOUNT — the player still owes it, they are just handing it
  // over on the pitch.
  await expect(page.getByTestId("amount-due")).toContainText(String(game.priceCzk));
});

test("full credit confirms instantly and shows no QR", async ({ page, context }) => {
  await signInAs(context, players.creditRich);
  // Comfortably more than the price: the wallet covers it and has headroom.
  await setWalletTo(players.creditRich.id, game.priceCzk + 250);

  await page.goto(`/game/${game.id}/book`);
  await page.getByTestId("pay-cash-input").check();
  await page.getByTestId("confirm-booking").click();

  await expect(page.getByTestId("confirmation")).toBeVisible();

  // The whole point of the full-credit path: nothing to pay, so nothing to
  // scan. A QR here would be a request for money the player does not owe.
  await expect(page.getByTestId("qr-payment")).toHaveCount(0);

  const admin = serviceClient();
  const { data } = await admin
    .from("bookings")
    .select("status,payment_method,credit_applied_czk,payment_code")
    .eq("game_id", game.id)
    .eq("player_id", players.creditRich.id)
    .single();

  expect(data?.status).toBe("confirmed");
  // Derived by the RPC from the balance — the client asked for `qr`.
  expect(data?.payment_method).toBe("credit");
  expect(data?.credit_applied_czk).toBe(game.priceCzk);
  // No money is owed, so there is no variable symbol to owe it against.
  expect(data?.payment_code).toBeNull();

  expect(await walletBalance(players.creditRich.id)).toBe(250);
});

test("partial credit reduces the amount due and still asks for the rest", async ({
  page,
  context,
}) => {
  const credit = 50;
  await signInAs(context, players.creditPartial);
  await setWalletTo(players.creditPartial.id, credit);

  await page.goto(`/game/${game.id}/book`);
  await page.getByTestId("pay-cash-input").check();
  await page.getByTestId("confirm-booking").click();

  await expect(page.getByTestId("confirmation")).toBeVisible();

  /*
   * THE AMOUNT IS THE SUBJECT, not the instrument. This test was named for
   * the QR screen because QR was the only way to owe money; round 7 item 10
   * makes cash the offered option and the arithmetic is identical. 200 priced,
   * 50 covered, 150 due.
   */
  const due = game.priceCzk - credit;
  await expect(page.getByTestId("amount-due")).toContainText(String(due));

  const admin = serviceClient();
  const { data } = await admin
    .from("bookings")
    .select("status,payment_method,credit_applied_czk")
    .eq("game_id", game.id)
    .eq("player_id", players.creditPartial.id)
    .single();

  expect(data?.status).toBe("reserved");
  expect(data?.payment_method).toBe("cash");
  expect(data?.credit_applied_czk).toBe(credit);
  expect(await walletBalance(players.creditPartial.id)).toBe(0);
});

/*
 * THE QR RAIL SURVIVES THE UI CHANGE — ruling R3's load-bearing half, and
 * round 13 item 6 is the change it was written for.
 *
 * R3 retired QR from the booking screens and was explicit that the machinery
 * behind it must not be touched: the `26`-series variable symbols, the topup
 * pair and the credit ledger are the substrate Stripe maps onto, and "a round
 * that cleans up the QR backend because the UI no longer calls it is deleting
 * the thing the next round needs".
 *
 * With QR gone from the booking form there is no click path to this screen any
 * more, so it is driven through the RPC — which is also the honest shape of
 * the claim. The claim is not "a player can reach this"; it is "the rail still
 * works and still renders", which is what has to be true on the day Stripe is
 * wired to it.
 */
test("the QR rail still books and still renders, with no UI offering it", async ({
  page,
  context,
}) => {
  const railGame = await createScratchGame({ hoursFromNow: 24 * 9, capacity: 8 });

  try {
    await setWalletTo(players.runner.id, 0);
    await signInAs(context, players.runner);

    // The rail, called directly. `qr` is still a value `create_booking`
    // accepts from a client and that is deliberate.
    const runner = await apiClientFor(players.runner);
    const { data, error } = await runner.rpc("create_booking", {
      p_game_id: railGame.id,
      p_payment_method: "qr",
    });
    expect(error, "create_booking refused the QR rail").toBeNull();

    /*
     * `create_booking` returns the BOOKING ROW, not a bare id — and the
     * variable symbol on it is the thing R3 is protecting. Reading `data` as
     * a string produced `?booking=undefined` and a blank confirmation that
     * looked exactly like "the QR block is gone", which is the wrong
     * conclusion to reach from a typo.
     */
    const booking = data as unknown as { id: string; payment_code: number };
    expect(booking.payment_code, "the 26-series variable symbol is gone").toBeGreaterThan(0);

    await page.goto(`/game/${railGame.id}/book/confirmation?booking=${booking.id}`);

    /*
     * ~~The QR renders: inline SVG with real path data, plus the fallback
     * fields someone types in when the camera will not focus.~~
     *
     * ROUND 13 ITEM 6 REMOVED THE CODE FROM THE SCREEN, and the assertion
     * inverts rather than disappearing. R3's two halves are still both here
     * and are still the point of this test — what changed is which half is
     * visible:
     *
     *   THE RAIL LIVES: `create_booking` still accepts `qr` from a client, the
     *   booking still gets a 26-series variable symbol, and the confirmation
     *   still renders for it. Both are asserted above and below.
     *   THE SCREEN IS GONE: there is no code to scan anywhere in the product,
     *   because a player pays by card now.
     */
    await expect(page.getByTestId("qr-payment")).toHaveCount(0);
    await expect(page.getByTestId("confirmation")).toBeVisible();

    // AND THE BOOKING FORM DOES NOT OFFER IT. Both halves of R3 in one test:
    // the rail lives, the UI does not expose it.
    await page.goto(`/game/${railGame.id}/book`);
    await expect(page.getByTestId("pay-online")).toBeVisible();
    await expect(page.getByTestId("pay-cash")).toBeVisible();
    const body = (await page.locator("form").innerText()).toLowerCase();
    expect(body, "the booking form still names QR").not.toContain("qr");
  } finally {
    await destroyScratchGame(railGame.id);
  }
});

test("a cancelled booking returns its value as wallet credit", async ({ page, context }) => {
  await signInAs(context, players.runner);
  await setWalletTo(players.runner.id, 0);

  await page.goto(`/game/${game.id}/book`);
  await page.getByTestId("pay-cash-input").check();
  await page.getByTestId("confirm-booking").click();
  await expect(page.getByTestId("confirmation")).toBeVisible();

  // Confirm the payment as the organizer would, so there is real value to
  // return — cancelling an unpaid hold correctly returns nothing.
  const admin = serviceClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id")
    .eq("game_id", game.id)
    .eq("player_id", players.runner.id)
    .single();

  await admin.rpc("confirm_booking", {
    p_booking_id: booking!.id,
    p_confirmed_by: players.organizer.id,
  });

  // The fixture list moved to `/my-games` (v1.2 §7); the balance it credits
  // still lives on `/account`, which is why the cancel action revalidates both.
  await page.goto("/my-games");

  // Cancelling asks for confirmation on purpose — the value comes back as
  // wallet credit rather than money, so it is not fully reversible from the
  // player's side. Playwright dismisses native dialogs by default, which would
  // silently make this spec assert that nothing happened.
  /*
   * A REAL DIALOG NOW, not `window.confirm` — §3 screen 5. Two taps: open it,
   * then confirm inside it. The browser box could not state the refund and had
   * nowhere to put a failure.
   */

  // Scoped to THIS game's row, never `.first()`: the seeded player holds other
  // bookings, and cancelling one of those would quietly rewrite the fixture
  // tableau every other spec reads from.
  const row = page
    .getByTestId("booking-row")
    .filter({ has: page.locator(`a[href="/game/${game.id}"]`) });
  await row.getByTestId("cancel-booking").click();
  await page.getByTestId("cancel-dialog-confirm").click();

  // Re-read the ACCOUNT page rather than asserting on the in-place success
  // message: the cancel revalidates the list this was clicked from, so the row
  // may already be gone — and the balance lives on the other route now, which
  // is exactly the thing the two-route revalidation exists to keep in step.
  await expect(async () => {
    await page.goto("/account");
    /*
     * The wallet reads in CREDITS and no longer prints a crown figure at all,
     * so the UI assertion is that the refund LANDED — one credit, from a 150
     * game. The exact amount is asserted against the ledger immediately
     * below, which is where a claim about money belongs anyway.
     */
    await expect(page.getByTestId("credit-balance")).toContainText("1");
  }).toPass({ timeout: 15_000 });

  expect(await walletBalance(players.runner.id)).toBe(game.priceCzk);

  // Left as we found it, or the next spec inherits a wallet.
  await setWalletTo(players.runner.id, 0);
});

/*
 * §3 screen 4 — the INSUFFICIENT-CREDITS state, and the two rules that govern
 * it (money-copy ruling, 2026-08-10).
 *
 * IT NEVER BLOCKS THE BOOKING. The spot is reserved by the time this renders:
 * `create_booking` applies whatever credit exists and falls back rather than
 * failing, so the offer sits BESIDE the payment and never in front of it. A
 * spec that only checked the upsell appeared would pass on a screen that had
 * trapped the player.
 *
 * A CONDITION, NOT A FIGURE. No crown shortfall — that would re-introduce the
 * unit the credits ruling removed, on the screen whose job is to teach that a
 * game costs one credit.
 */
test("a booking the wallet cannot cover offers credits AND still takes payment", async ({
  page,
  context,
}) => {
  const game = await createScratchGame({ hoursFromNow: 24 * 8, capacity: 12 });

  try {
    await setWalletTo(players.runner.id, 0);
    await signInAs(context, players.runner);

    await page.goto(`/game/${game.id}/book`);
    await page.getByTestId("pay-cash-input").check();
    await page.getByTestId("confirm-booking").click();
    await page.waitForURL(/\/book\/confirmation/);

    const offer = page.getByTestId("not-enough-credits");
    await expect(offer).toBeVisible();

    // Both routes, per the ruling: credits primary, paying for this one
    // secondary — and the booking already exists either way.
    await expect(page.getByTestId("get-credits")).toHaveAttribute("href", "/pass");
    await expect(page.getByTestId("amount-due")).toBeVisible();
    await expect(page.getByTestId("confirmation")).toBeVisible();

    // No crown shortfall anywhere in the offer.
    await expect(offer).not.toContainText(/\d+\s*CZK/);
    await expect(offer).toContainText("1 credit");
  } finally {
    await setWalletTo(players.runner.id, 0);
    await destroyScratchGame(game.id);
  }
});
