import { expect, test } from "@playwright/test";
import { apiClientFor, players, serviceClient } from "./helpers/session";
import {
  createScratchGame,
  destroyScratchGame,
  setWalletTo,
  walletBalance,
} from "./helpers/scaffold";

/**
 * ROUND 29 — AUTO-SETTLE.
 *
 * The forward path, asserted end to end through the sweep: a game that kicked
 * off goes `published` -> `played` -> `settled` in ONE run, with nothing
 * manual in between and no money moved.
 */

/** The cron's call, exactly — buffer 0 so a scratch game in the past qualifies. */
async function sweep() {
  const { data, error } = await serviceClient().rpc("advance_played_games", {
    p_buffer_minutes: 0,
  });
  expect(error, `advance_played_games: ${error?.message}`).toBeNull();
  return data as {
    advanced: number;
    settled: number;
    skipped: number;
    skippedGameIds: string[];
  };
}

/**
 * BOOKINGS ARE MADE THROUGH THE RPCs, NEVER BY INSERT.
 *
 * `service_role` has no INSERT and no UPDATE on `bookings` — deliberately, and
 * CLAUDE.md records the UPDATE half costing an earlier session a debugging
 * run. The first draft of this file inserted directly; the writes were refused
 * silently, two specs failed on a null row, and the third PASSED VACUOUSLY
 * because a game with no bookings settles just fine.
 *
 * So a game is built in the FUTURE, booked properly, and then aged into the
 * past — `service_role` does hold UPDATE on `games`.
 */
async function ageGame(gameId: string, hoursAgo: number) {
  const { error } = await serviceClient()
    .from("games")
    .update({ starts_at: new Date(Date.now() - hoursAgo * 3_600_000).toISOString() })
    .eq("id", gameId);
  expect(error, `ageGame: ${error?.message}`).toBeNull();
}

/** A PAID booking, through pay-first — the rail every real booking now takes. */
async function bookPaid(gameId: string, sessionId: string, priceCzk = 150) {
  const client = await apiClientFor(players.runner);
  const opened = await client.rpc("open_checkout", {
    p_game_id: gameId,
    p_guest_count: 0,
    p_stripe_session_id: sessionId,
    p_amount_czk: priceCzk,
  });
  expect(opened.error, `open_checkout: ${opened.error?.message}`).toBeNull();

  const settled = await serviceClient().rpc("settle_checkout_session", {
    p_stripe_session_id: sessionId,
    p_amount_czk: priceCzk,
  });
  expect(settled.error, `settle_checkout_session: ${settled.error?.message}`).toBeNull();
  expect(settled.data).toBe("booked");
}

/**
 * An UNPAID hold — the admin-created edge the tripwire exists for.
 *
 * THE WALLET IS EMPTIED FIRST. `create_booking` on the cash rail spends
 * whatever credit the player holds, and a wallet that covers the game pays it
 * outright — the booking is born `confirmed` and there is no hold to test.
 * Round 27 lost an afternoon to exactly this in `strips-stage2`.
 */
async function bookUnpaid(gameId: string) {
  const before = await walletBalance(players.runner.id);
  await setWalletTo(players.runner.id, 0);
  const client = await apiClientFor(players.runner);
  const { error } = await client.rpc("create_booking", {
    p_game_id: gameId,
    p_payment_method: "cash",
  });
  expect(error, `create_booking: ${error?.message}`).toBeNull();
  return before;
}

async function statusOf(gameId: string) {
  const { data } = await serviceClient()
    .from("games")
    .select("status")
    .eq("id", gameId)
    .single();
  return (data as { status: string } | null)?.status;
}

const RUN = `r29${Date.now().toString(36)}`;

test("one sweep takes a played game all the way to settled", async () => {
  // Arrange — a paid booking, then the game aged past its buffer.
  const game = await createScratchGame({ capacity: 8, priceCzk: 150 });

  try {
    const admin = serviceClient();
    await bookPaid(game.id, `cs_${RUN}_clean`);
    await ageGame(game.id, 3);

    const { count: ledgerBefore } = await admin
      .from("credit_ledger")
      .select("id", { count: "exact", head: true });

    // Act — one run, nothing manual.
    const result = await sweep();

    // Assert — it went the whole way.
    expect(await statusOf(game.id), "the sweep stopped short of settled").toBe("settled");
    expect(result.settled).toBeGreaterThan(0);

    /*
     * AND NO MONEY MOVED. The sweep asserts this internally and rolls itself
     * back if it is false; this checks the same thing from outside, because an
     * invariant that only reports on itself is one edit away from reporting
     * nothing.
     */
    const { count: ledgerAfter } = await admin
      .from("credit_ledger")
      .select("id", { count: "exact", head: true });
    expect(ledgerAfter).toBe(ledgerBefore);
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("an unpaid hold stops the close, and the sweep says which game", async () => {
  /*
   * THE TRIPWIRE. Under pay-first no rostered player can be unpaid, so the
   * only way to reach this is a cash/admin-created booking — which is exactly
   * the edge the check survives for. A skip is NEWS: it must not fail the run,
   * and it must name the game.
   */
  // Arrange
  const game = await createScratchGame({ capacity: 8, priceCzk: 150 });
  const walletBefore = await bookUnpaid(game.id);

  try {
    await ageGame(game.id, 3);

    // Act
    const result = await sweep();

    // Assert — played, not settled, and reported by id.
    expect(await statusOf(game.id)).toBe("played");
    expect(result.skipped).toBeGreaterThan(0);
    expect(result.skippedGameIds).toContain(game.id);
  } finally {
    await destroyScratchGame(game.id);
    await setWalletTo(players.runner.id, walletBefore);
  }
});

test("resolving the hold lets a later sweep close the game", async () => {
  /*
   * THE HALF THAT MAKES THE TRIPWIRE SAFE. The sweep looks at every `played`
   * game past its buffer, not only the ones it advanced this run — so a game
   * held back by an unpaid row closes on the NEXT run once the row is gone.
   * Without that, a skipped game would stay `played` for ever and the tripwire
   * would be a trap.
   */
  // Arrange
  const game = await createScratchGame({ capacity: 8, priceCzk: 150 });
  const walletBefore = await bookUnpaid(game.id);

  try {
    await ageGame(game.id, 3);
    await sweep();
    expect(await statusOf(game.id)).toBe("played");

    /*
     * THE HOLD IS RESOLVED THE WAY AN ADMIN RESOLVES ONE — `confirm_booking`,
     * not an UPDATE. `service_role` has no UPDATE on `bookings` at all, which
     * is the grant that made the first draft of this file fail silently.
     */
    const { data: rows } = await serviceClient()
      .from("bookings")
      .select("id")
      .eq("game_id", game.id)
      .eq("status", "reserved");
    const bookingId = (rows as { id: string }[])[0]!.id;

    const organizer = await apiClientFor(players.organizer);
    const confirmed = await organizer.rpc("confirm_booking", {
      p_booking_id: bookingId,
      p_confirmed_by: players.organizer.id,
      p_received_amount_czk: 150,
    });
    expect(confirmed.error, `confirm_booking: ${confirmed.error?.message}`).toBeNull();

    // Act
    await sweep();

    // Assert
    expect(await statusOf(game.id)).toBe("settled");
  } finally {
    await destroyScratchGame(game.id);
    await setWalletTo(players.runner.id, walletBefore);
  }
});

test("attendance is still editable after the sweep has settled the game", async () => {
  /*
   * THE OWNER'S RULE, asserted rather than assumed. `mark_attendance` gates on
   * the BOOKING's status, never the game's — which is why settling could be
   * automated at all. A late no-show mark must still land.
   */
  // Arrange
  const game = await createScratchGame({ capacity: 8, priceCzk: 150 });

  try {
    await bookPaid(game.id, `cs_${RUN}_late`);
    await ageGame(game.id, 3);
    await sweep();
    expect(await statusOf(game.id)).toBe("settled");

    const { data: rows } = await serviceClient()
      .from("bookings")
      .select("id")
      .eq("game_id", game.id)
      .eq("status", "confirmed");
    const bookingId = (rows as { id: string }[])[0]!.id;

    // Act — a late correction, after the books are closed.
    const organizer = await apiClientFor(players.organizer);
    const { error } = await organizer.rpc("mark_attendance", {
      p_booking_id: bookingId,
      p_attendance: "no_show",
    });

    // Assert
    expect(error, `mark_attendance after settlement: ${error?.message}`).toBeNull();
    const { data: after } = await serviceClient()
      .from("bookings")
      .select("attendance")
      .eq("id", bookingId)
      .single();
    expect((after as { attendance: string } | null)?.attendance).toBe("no_show");
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("manual settling is gone from the database, not merely from the page", async () => {
  // Arrange / Act — the RPC no longer exists.
  const { error } = await serviceClient().rpc(
    "settle_game" as never,
    { p_game_id: "00000000-0000-0000-0000-000000000000" } as never,
  );

  // Assert: PostgREST answers an unknown function with PGRST202.
  expect(error, "settle_game is still callable").not.toBeNull();
  expect(error?.code).toBe("PGRST202");
});
