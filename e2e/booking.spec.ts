import { expect, test } from "@playwright/test";
import { players, serviceClient, signInAs } from "./helpers/session.ts";
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

test("book to QR in under 60 seconds", async ({ page, context }) => {
  await signInAs(context, players.runner);
  await setWalletTo(players.runner.id, 0);

  // The clock starts where the player's does: on the game page, having decided
  // to play. Sixty seconds is the criterion, and it is measured against the
  // real database — no mocked RPCs, no pre-warmed route.
  const started = Date.now();

  await page.goto(`/game/${game.id}`);
  await page.getByTestId("book-cta").click();
  await page.getByRole("radio", { name: /QR/i }).check();
  await page.getByTestId("confirm-booking").click();

  const qr = page.getByTestId("qr-payment");
  await expect(qr).toBeVisible();

  const elapsedSeconds = (Date.now() - started) / 1000;
  expect(elapsedSeconds).toBeLessThan(60);

  // A QR that renders but encodes nothing is not a payment. It is rendered as
  // inline SVG (no image request, so it works with the network already gone),
  // and it must carry real path data rather than an empty frame. The fallback
  // fields — the ones someone types in when the camera will not focus — must
  // be there too.
  const svg = qr.locator("svg");
  await expect(svg).toBeVisible();
  expect(await svg.locator("path").count()).toBeGreaterThan(0);
  await expect(page.getByTestId("fallback-vs")).toBeVisible();
  await expect(page.getByTestId("fallback-account")).toBeVisible();
  await expect(page.getByTestId("amount-due")).toContainText(String(game.priceCzk));
});

test("full credit confirms instantly and shows no QR", async ({ page, context }) => {
  await signInAs(context, players.creditRich);
  // Comfortably more than the price: the wallet covers it and has headroom.
  await setWalletTo(players.creditRich.id, game.priceCzk + 250);

  await page.goto(`/game/${game.id}/book`);
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

test("partial credit reduces the amount due and still asks for a QR payment", async ({
  page,
  context,
}) => {
  const credit = 50;
  await signInAs(context, players.creditPartial);
  await setWalletTo(players.creditPartial.id, credit);

  await page.goto(`/game/${game.id}/book`);
  await page.getByRole("radio", { name: /QR/i }).check();
  await page.getByTestId("confirm-booking").click();

  await expect(page.getByTestId("qr-payment")).toBeVisible();

  // 200 priced, 50 covered, 150 due — and the number on the screen is the
  // number in the QR, because both come from the persisted booking.
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
  expect(data?.payment_method).toBe("qr");
  expect(data?.credit_applied_czk).toBe(credit);
  expect(await walletBalance(players.creditPartial.id)).toBe(0);
});

test("a cancelled booking returns its value as wallet credit", async ({ page, context }) => {
  await signInAs(context, players.runner);
  await setWalletTo(players.runner.id, 0);

  await page.goto(`/game/${game.id}/book`);
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
  page.once("dialog", (dialog) => dialog.accept());

  // Scoped to THIS game's row, never `.first()`: the seeded player holds other
  // bookings, and cancelling one of those would quietly rewrite the fixture
  // tableau every other spec reads from.
  const row = page
    .getByTestId("booking-row")
    .filter({ has: page.locator(`a[href="/game/${game.id}"]`) });
  await row.getByTestId("cancel-booking").click();

  // Re-read the ACCOUNT page rather than asserting on the in-place success
  // message: the cancel revalidates the list this was clicked from, so the row
  // may already be gone — and the balance lives on the other route now, which
  // is exactly the thing the two-route revalidation exists to keep in step.
  await expect(async () => {
    await page.goto("/account");
    // The CROWNS, which is the secondary figure now — the headline counts
    // credits since the flat-150 ruling. The refund's correctness is a
    // statement about the ledger, so it is the ledger figure that carries it.
    await expect(page.getByTestId("credit-balance-czk")).toContainText(
      String(game.priceCzk),
    );
  }).toPass({ timeout: 15_000 });

  expect(await walletBalance(players.runner.id)).toBe(game.priceCzk);

  // Left as we found it, or the next spec inherits a wallet.
  await setWalletTo(players.runner.id, 0);
});
