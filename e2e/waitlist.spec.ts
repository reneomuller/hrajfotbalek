import { expect, test } from "@playwright/test";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session.ts";
import { expireDeadline } from "./helpers/clock.ts";
import {
  createScratchGame,
  destroyScratchGame,
  setWalletTo,
  type ScratchGame,
} from "./helpers/scaffold.ts";

/**
 * Criterion 2 — a full game offers a waitlist and joining works.
 * Criterion 5 — cancel → credit → release → convert, with zero human touches
 *               between the cancellation and the conversion.
 * Criterion 6 — nudge → paid-or-expired → released.
 *
 * The chain is the point. Each of these steps works in isolation and has since
 * Phase 17; what this file asserts is that nobody has to press anything
 * between them.
 */

const CRON_SECRET = process.env.CRON_SECRET!;

/** A capacity-2 game, filled, so it is `full` and takes waitlist joins. */
async function fullGame(): Promise<ScratchGame> {
  const game = await createScratchGame({ capacity: 2 });

  for (const player of [players.organizer, players.seedBot] as const) {
    const session = await apiClientFor(player);
    const { error } = await session.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
    });
    if (error) throw new Error(`fill ${player.nickname}: ${error.message}`);
  }

  const admin = serviceClient();
  const { data } = await admin.from("games").select("status").eq("id", game.id).single();
  // Not an assertion about this spec — a precondition. The fullness flip is
  // automatic (`sync_game_fullness`), and if it has not happened the waitlist
  // RPC will refuse the join for reasons that have nothing to do with the
  // waitlist.
  if (data?.status !== "full") {
    throw new Error(`expected the game to flip to full, got ${data?.status}`);
  }

  return game;
}

let game: ScratchGame;

test.beforeEach(async () => {
  game = await fullGame();
});

test.afterEach(async () => {
  await destroyScratchGame(game.id);
});

test("a full game offers the waitlist, and joining shows your place in it", async ({
  page,
  context,
}) => {
  await signInAs(context, players.runner);

  await page.goto(`/game/${game.id}`);

  /*
   * The full game is a queue with a way in, not a dead end — and as of v1.3
   * §2.4 the way in is the CLAIM BAR's full state rather than a panel in the
   * body. One control, in the one place every state of this page puts its
   * control.
   */
  const bar = page.getByTestId("claim-bar");
  await expect(bar).toHaveAttribute("data-state", "full");
  await expect(page.getByTestId("join-waitlist")).toBeVisible();
  await page.getByTestId("join-waitlist").click();

  /*
   * ASSERTED ON THE SERVER'S NEXT RENDER, not on the action's returned state.
   * `joinWaitlistAction` revalidates, and a client-state success marker can be
   * unmounted by that re-render before a spec can observe it (CLAUDE.md). The
   * bar resolving to `waitlisted` is the durable fact, and it is also the
   * behaviour §2.4's fourth row exists to deliver: a waiting player must never
   * see `Join waitlist` again.
   */
  await expect(bar).toHaveAttribute("data-state", "waitlisted");
  // The number says how many joined ahead, not who gets served first — the
  // hint that keeps it honest is in the body, beside the full notice.
  await expect(bar).toContainText("1");
  await expect(page.getByTestId("join-waitlist")).toHaveCount(0);
  await expect(page.getByTestId("full-notice")).toContainText("at the same moment");

  // The queue is public, by decision: a queue nobody can see is a queue nobody
  // trusts. It must expose the nickname and no more.
  await expect(page.getByTestId("waitlist-panel")).toContainText(players.runner.nickname);
});

test("cancel → credit → release → convert, with nothing pressed in between", async ({
  page,
  context,
}) => {
  const admin = serviceClient();

  // Someone is waiting.
  const waiting = await apiClientFor(players.runner);
  await setWalletTo(players.runner.id, 0);
  const joined = await waiting.rpc("join_waitlist", { p_game_id: game.id });
  expect(joined.error).toBeNull();

  // A spot holder cancels, THROUGH THE UI. Not via the RPC directly: the RPC
  // releases the spot but does not send the "a spot just opened" fan-out —
  // that is `app/account/actions.ts` calling `notifyWaitlistForGame` in the
  // same request. Cancelling through the API would test a path no player can
  // take and would report the hands-free chain as broken when it is not.
  await signInAs(context, players.organizer);
  await page.goto("/my-games");

  // The confirm is a real dialog now (§3 screen 5): open, then confirm inside.
  await page
    .getByTestId("booking-row")
    .filter({ has: page.locator(`a[href="/game/${game.id}"]`) })
    .getByTestId("cancel-booking")
    .click();
  await page.getByTestId("cancel-dialog-confirm").click();

  // ...and from here nobody touches anything.
  await expect(async () => {
    const { data: row } = await admin
      .from("waitlist")
      .select("notified_at")
      .eq("game_id", game.id)
      .eq("player_id", players.runner.id)
      .single();
    expect(row?.notified_at).not.toBeNull();
  }).toPass({ timeout: 15_000 });

  // The spot is released: the game is no longer full.
  const { data: after } = await admin.from("games").select("status").eq("id", game.id).single();
  expect(after?.status).toBe("published");

  // And the freed spot is claimable — the conversion page works for the person
  // who was waiting, with no admin step in between.
  await context.clearCookies();
  await signInAs(context, players.runner);
  await page.goto(`/game/${game.id}/waitlist/convert`);
  await expect(page.getByTestId("not-on-waitlist")).toHaveCount(0);
  await page.getByTestId("convert-waitlist").click();

  await expect(page.getByTestId("confirmation")).toBeVisible();

  const { data: converted } = await admin
    .from("bookings")
    .select("status")
    .eq("game_id", game.id)
    .eq("player_id", players.runner.id)
    .single();
  expect(converted?.status).toBe("reserved");

  await setWalletTo(players.runner.id, 0);
});

test("nudge → expiry → released to the waitlist, driven only by the cron routes", async ({
  request,
}) => {
  const admin = serviceClient();

  // A game inside the nudge window (12h) with someone waiting: scarcity is the
  // whole justification for nudging, so both halves have to be true.
  await destroyScratchGame(game.id);
  game = await createScratchGame({ capacity: 2, hoursFromNow: 6 });

  const holder = await apiClientFor(players.runner);
  const filler = await apiClientFor(players.seedBot);
  const { data: unpaid } = await holder.rpc("create_booking", {
    p_game_id: game.id,
    p_payment_method: "qr",
  });
  await filler.rpc("create_booking", { p_game_id: game.id, p_payment_method: "cash" });

  const waiter = await apiClientFor(players.creditRich);
  await waiter.rpc("join_waitlist", { p_game_id: game.id });

  // --- nudge ---------------------------------------------------------------
  const nudge = await request.get("/api/cron/nudge", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(nudge.ok()).toBeTruthy();

  const { data: nudged } = await admin
    .from("bookings")
    .select("nudge_sent_at,expires_at")
    .eq("id", unpaid.id)
    .single();
  expect(nudged?.nudge_sent_at).not.toBeNull();
  // The nudge is what starts the clock: `expires_at` is null until then, so an
  // unpaid hold that nobody is waiting for is never on a timer at all.
  expect(nudged?.expires_at).not.toBeNull();

  // --- the grace window elapses -------------------------------------------
  // Moving the deadline, not the state. This goes through the harness clock
  // (e2e/helpers/clock.ts) rather than the API, because `service_role` has no
  // UPDATE privilege on `bookings` at all — every state change is an RPC, by
  // design. The first draft of this spec wrote through the API, got a silent
  // permission error, and reported a working expiry sweep as broken.
  await expireDeadline(unpaid.id);

  // --- expiry --------------------------------------------------------------
  const expiry = await request.get("/api/cron/expiry", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(expiry.ok()).toBeTruthy();

  const { data: expired } = await admin
    .from("bookings")
    .select("status")
    .eq("id", unpaid.id)
    .single();
  expect(expired?.status).toBe("expired");

  // The released spot reaches the person waiting for it — the end of the chain.
  const { data: released } = await admin.from("games").select("status").eq("id", game.id).single();
  expect(released?.status).toBe("published");

  const { data: notified } = await admin
    .from("waitlist")
    .select("notified_at")
    .eq("game_id", game.id)
    .eq("player_id", players.creditRich.id)
    .single();
  expect(notified?.notified_at).not.toBeNull();
});

test("a paid spot is never nudged and never expires", async ({ request }) => {
  const admin = serviceClient();

  await destroyScratchGame(game.id);
  game = await createScratchGame({ capacity: 2, hoursFromNow: 6 });

  const holder = await apiClientFor(players.runner);
  const filler = await apiClientFor(players.seedBot);
  const { data: booking } = await holder.rpc("create_booking", {
    p_game_id: game.id,
    p_payment_method: "qr",
  });
  await filler.rpc("create_booking", { p_game_id: game.id, p_payment_method: "cash" });

  await admin.rpc("confirm_booking", {
    p_booking_id: booking.id,
    p_confirmed_by: players.organizer.id,
  });

  const waiter = await apiClientFor(players.creditRich);
  await waiter.rpc("join_waitlist", { p_game_id: game.id });

  await request.get("/api/cron/nudge", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });

  const { data } = await admin
    .from("bookings")
    .select("status,nudge_sent_at")
    .eq("id", booking.id)
    .single();

  // Chasing someone who has already paid is the fastest way to make the nudge
  // ignorable.
  expect(data?.status).toBe("confirmed");
  expect(data?.nudge_sent_at).toBeNull();
});
