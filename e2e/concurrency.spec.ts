import { expect, test } from "@playwright/test";
import { anonClient, apiClientFor, players, serviceClient } from "./helpers/session.ts";
import {
  createScratchGame,
  destroyScratchGame,
  setWalletTo,
  walletBalance,
} from "./helpers/scaffold.ts";

/**
 * Criterion 11 — two sessions racing for the last spot leave exactly one booking.
 * Criterion 16 — two credit-funded bookings redeem the wallet at most once, and
 *                the ledger never goes negative.
 *
 * ASSERT DATABASE STATE, NEVER TIMING. Which request wins is genuinely
 * undefined and depends on scheduling; "exactly one booking exists" is
 * deterministic no matter who won. A spec written the other way is a spec that
 * gets disabled after a month of false alarms — and disabled concurrency tests
 * are how a double-booking reaches a pitch.
 *
 * These run against the real RPCs. The invariants live in advisory locks and
 * transaction boundaries inside plpgsql; nothing about them survives a mock.
 */

test("two players racing for the last spot leave exactly one booking", async () => {
  // A single seat, and two people reaching for it at the same instant.
  const game = await createScratchGame({ capacity: 1 });

  try {
    const [a, b] = await Promise.all([
      apiClientFor(players.runner),
      apiClientFor(players.creditPartial),
    ]);
    await Promise.all([
      setWalletTo(players.runner.id, 0),
      setWalletTo(players.creditPartial.id, 0),
    ]);

    // Fired without awaiting in between — the point is that both are in flight.
    const results = await Promise.all([
      a.rpc("create_booking", { p_game_id: game.id, p_payment_method: "qr" }),
      b.rpc("create_booking", { p_game_id: game.id, p_payment_method: "qr" }),
    ]);

    const admin = serviceClient();
    const { data: bookings } = await admin
      .from("bookings")
      .select("id,player_id,status")
      .eq("game_id", game.id)
      .in("status", ["reserved", "confirmed"]);

    // THE invariant. Not "the first one won" — exactly one exists.
    expect(bookings ?? []).toHaveLength(1);

    // And the loser was told why, in the language of a normal outcome rather
    // than an exception: losing a capacity race is not an error condition.
    const winners = results.filter((r) => r.error === null);
    const losers = results.filter((r) => r.error !== null);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0].error?.message).toMatch(/CAPACITY_FULL/);

    // The game flipped itself full off the back of the winner, with nobody
    // pressing anything.
    const { data: after } = await admin
      .from("games")
      .select("status")
      .eq("id", game.id)
      .single();
    expect(after?.status).toBe("full");
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("a wallet cannot be spent twice by two simultaneous bookings", async () => {
  // Two different games, one wallet, and only enough credit for one of them.
  const gameA = await createScratchGame();
  const gameB = await createScratchGame();

  try {
    const credit = 200;
    await setWalletTo(players.creditRich.id, credit);

    const session = await apiClientFor(players.creditRich);

    await Promise.all([
      session.rpc("create_booking", { p_game_id: gameA.id, p_payment_method: "qr" }),
      session.rpc("create_booking", { p_game_id: gameB.id, p_payment_method: "qr" }),
    ]);

    const admin = serviceClient();
    const { data: rows } = await admin
      .from("bookings")
      .select("game_id,credit_applied_czk,status")
      .in("game_id", [gameA.id, gameB.id])
      .eq("player_id", players.creditRich.id);

    const applied = (rows ?? []).reduce(
      (sum: number, row: { credit_applied_czk: number }) => sum + row.credit_applied_czk,
      0,
    );

    // At most once. Both bookings may exist — that is fine and expected; what
    // must not happen is the same 200 CZK paying for both of them.
    expect(applied).toBeLessThanOrEqual(credit);

    // The ledger is the authority, and it may never go negative: a negative
    // wallet is money the platform has spent that nobody ever paid it.
    const balance = await walletBalance(players.creditRich.id);
    expect(balance).toBeGreaterThanOrEqual(0);
    expect(balance).toBe(credit - applied);
  } finally {
    await destroyScratchGame(gameA.id);
    await destroyScratchGame(gameB.id);
    await setWalletTo(players.creditRich.id, 0);
  }
});

test("the ledger stays non-negative under a burst of concurrent bookings", async () => {
  // Same invariant, more pressure: five games, one wallet with enough for two.
  const games = await Promise.all(
    Array.from({ length: 5 }, () => createScratchGame({ priceCzk: 100 })),
  );

  try {
    await setWalletTo(players.creditRich.id, 200);
    const session = await apiClientFor(players.creditRich);

    await Promise.all(
      games.map((game) =>
        session.rpc("create_booking", { p_game_id: game.id, p_payment_method: "qr" }),
      ),
    );

    expect(await walletBalance(players.creditRich.id)).toBeGreaterThanOrEqual(0);

    const admin = serviceClient();
    const { data: rows } = await admin
      .from("bookings")
      .select("credit_applied_czk")
      .in(
        "game_id",
        games.map((g) => g.id),
      )
      .eq("player_id", players.creditRich.id);

    const applied = (rows ?? []).reduce(
      (sum: number, row: { credit_applied_czk: number }) => sum + row.credit_applied_czk,
      0,
    );
    expect(applied).toBeLessThanOrEqual(200);
  } finally {
    for (const game of games) await destroyScratchGame(game.id);
    await setWalletTo(players.creditRich.id, 0);
  }
});

test("an anonymous caller cannot book at all, however it races", async () => {
  const game = await createScratchGame({ capacity: 1 });

  try {
    const anon = anonClient();
    const { error } = await anon.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "qr",
    });

    // Identity comes from `auth.uid()` inside the function. With no session
    // there is nobody to book for, and the refusal happens in the RPC rather
    // than in a UI check that a curl request would skip straight past.
    expect(error).not.toBeNull();

    const admin = serviceClient();
    const { data: bookings } = await admin.from("bookings").select("id").eq("game_id", game.id);
    expect(bookings ?? []).toHaveLength(0);
  } finally {
    await destroyScratchGame(game.id);
  }
});
