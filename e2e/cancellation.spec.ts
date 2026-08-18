import { expect, test } from "@playwright/test";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session.ts";
import {
  createScratchGame,
  destroyScratchGame,
  setWalletTo,
  walletBalance,
} from "./helpers/scaffold.ts";
import { policy } from "../lib/policy";

/**
 * POLICY v2 — the ten-hour refund cutoff (migration 40).
 *
 * THE RULING, in three parts, and each is a test below:
 *
 *   at or beyond 10h   cancel, full credit — exactly what v1 did
 *   inside 10h         cancel, spot freed, NO credit
 *   after kickoff      refused, exactly what v1 did
 *
 * WHY THE SPOT STILL FREES IS THE POINT. The gate is on the money, not on the
 * cancellation: a player who cannot come should always be able to say so, and
 * a rule that punishes them for it produces no-shows instead of cancellations.
 * A test that only checked "no credit" would pass on an implementation that
 * refused the cancellation outright, which is the wrong product.
 *
 * ASSERTED AGAINST THE DATABASE, not against a rendered marker. Cancellation
 * redirects and revalidates, and CLAUDE.md records that a client-state success
 * marker can be unmounted before it is observed. The ledger is the durable
 * fact.
 *
 * These build and destroy their own games and reset their own wallets, so the
 * seed tableau is unchanged afterwards.
 */

const CUTOFF = policy.cancellation.refundCutoffHoursBeforeStart;

test("beyond the cutoff, a cancellation still credits in full", async () => {
  // Arrange — a paid spot on a game comfortably outside the window.
  await setWalletTo(players.creditRich.id, 0);
  const game = await createScratchGame({ capacity: 6, priceCzk: 200, hoursFromNow: 48 });

  try {
    const player = await apiClientFor(players.creditRich);
    const admin = serviceClient();
    const { data: booking } = await player.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
    });
    await admin.rpc("confirm_booking", {
      p_booking_id: booking!.id,
      p_confirmed_by: players.organizer.id,
    });
    const before = await walletBalance(players.creditRich.id);

    // Act
    const { data: result, error } = await player.rpc("cancel_booking", {
      p_booking_id: booking!.id,
    });

    // Assert
    expect(error).toBeNull();
    expect(result!.credit_issued_czk).toBe(200);
    expect(await walletBalance(players.creditRich.id)).toBe(before + 200);
  } finally {
    await destroyScratchGame(game.id);
    await setWalletTo(players.creditRich.id, 0);
  }
});

test("inside the cutoff, the spot is freed and nothing is credited", async () => {
  /*
   * THE GAME IS CREATED OUTSIDE THE WINDOW AND THEN MOVED IN.
   *
   * `create_booking` refuses a game that has already started and the admin
   * RPCs bound what they accept, so a fixture cannot be born two hours out and
   * booked. `starts_at` is not state-bearing — `games.status` is — so moving
   * it simulates elapsed time rather than fabricating a state, which is the
   * same move the seed makes when it backdates played games.
   *
   * Through the OWNER connection: `service_role` has no UPDATE on `games`, and
   * a PostgREST update would fail silently rather than raise — the trap
   * CLAUDE.md records for `bookings` and this suite hit again on `venues`.
   */
  await setWalletTo(players.creditRich.id, 0);
  const game = await createScratchGame({ capacity: 6, priceCzk: 200, hoursFromNow: 48 });

  try {
    const player = await apiClientFor(players.creditRich);
    const admin = serviceClient();
    const { data: booking } = await player.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
    });
    await admin.rpc("confirm_booking", {
      p_booking_id: booking!.id,
      p_confirmed_by: players.organizer.id,
    });
    const before = await walletBalance(players.creditRich.id);

    const { execAsOwner } = await import("./helpers/clock.ts");
    await execAsOwner(
      "update public.games set starts_at = now() + interval '2 hours' where id = $1",
      [game.id],
    );

    // Act
    const { data: result, error } = await player.rpc("cancel_booking", {
      p_booking_id: booking!.id,
    });

    // Assert — cancelled, and the money stayed where it was.
    expect(error).toBeNull();
    expect(result!.status).toBe("cancelled");
    expect(result!.credit_issued_czk).toBe(0);
    expect(Number(result!.cancel_lead_hours)).toBeLessThan(CUTOFF);
    expect(await walletBalance(players.creditRich.id)).toBe(before);

    // THE SPOT IS ACTUALLY FREE. Somebody else can take it, which is the whole
    // reason late cancellation stays open.
    const other = await apiClientFor(players.creditPartial);
    const { error: rebookError } = await other.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
    });
    expect(rebookError).toBeNull();

    // And the forfeit is on the record, so a later complaint can be answered.
    const { data: events } = await admin
      .from("events")
      .select("metadata")
      .eq("booking_id", booking!.id)
      .eq("event_type", "booking_cancelled");
    expect(events![0].metadata.forfeited_czk).toBe(200);
    expect(events![0].metadata.credit_issued_czk).toBe(0);
  } finally {
    await destroyScratchGame(game.id);
    await setWalletTo(players.creditRich.id, 0);
    await setWalletTo(players.creditPartial.id, 0);
  }
});

test("the cancel dialog warns before taking the credit, and still offers the cancel", async ({
  page,
  context,
}) => {
  /*
   * THE COPY HALF. A dialog that went on saying "what you paid goes back as
   * wallet credit" while taking 200 CZK would be the product lying at the
   * moment a player is deciding — worse than having no dialog at all.
   */
  await setWalletTo(players.creditRich.id, 0);
  const game = await createScratchGame({ capacity: 6, priceCzk: 200, hoursFromNow: 48 });

  try {
    const player = await apiClientFor(players.creditRich);
    const { data: booking } = await player.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
    });

    await signInAs(context, players.creditRich);

    /*
       BOTH BRANCHES, IN ONE TEST. Asserting only the warning would pass on an
       implementation that had got stuck showing it — which would accuse every
       cancellation of forfeiting. So: the ordinary reassurance first, while
       the game is still 48 hours out.
    */
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    await page.getByTestId("cancel-booking").click();
    await expect(page.getByTestId("cancel-refund-note")).toBeVisible();
    await expect(page.getByTestId("cancel-forfeit-note")).toHaveCount(0);

    const { execAsOwner } = await import("./helpers/clock.ts");
    await execAsOwner(
      "update public.games set starts_at = now() + interval '2 hours' where id = $1",
      [game.id],
    );

    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });

    // The affordance is STILL THERE inside the window — this is the half a
    // "no refund" implementation gets wrong by hiding the button.
    const open = page.getByTestId("cancel-booking");
    await expect(open).toBeVisible();
    await open.click();

    await expect(page.getByTestId("cancel-dialog")).toBeVisible();
    await expect(page.getByTestId("cancel-forfeit-note")).toBeVisible();
    await expect(page.getByTestId("cancel-forfeit-note")).toContainText(String(CUTOFF));
    // The promise it must NOT be making.
    await expect(page.getByTestId("cancel-refund-note")).toHaveCount(0);

    void booking;
  } finally {
    await destroyScratchGame(game.id);
    await setWalletTo(players.creditRich.id, 0);
  }
});

test("after kickoff a cancellation is refused, unchanged from v1", async () => {
  // Arrange
  const game = await createScratchGame({ capacity: 6, priceCzk: 200, hoursFromNow: 48 });

  try {
    const player = await apiClientFor(players.creditRich);
    const { data: booking } = await player.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
    });

    const { execAsOwner } = await import("./helpers/clock.ts");
    await execAsOwner(
      "update public.games set starts_at = now() - interval '1 minute' where id = $1",
      [game.id],
    );

    // Act
    const { error } = await player.rpc("cancel_booking", { p_booking_id: booking!.id });

    // Assert
    expect(error?.message).toBe("CANCEL_WINDOW_CLOSED");
  } finally {
    await destroyScratchGame(game.id);
    await setWalletTo(players.creditRich.id, 0);
  }
});
