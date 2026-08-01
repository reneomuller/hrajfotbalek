import { expect, test } from "@playwright/test";
import { createScratchGame, destroyScratchGame, resetWallet } from "./helpers/scaffold.ts";
import { anonClient, apiClientFor, players, serviceClient, signInAs } from "./helpers/session.ts";
import { moveBatchExpiry } from "./helpers/clock.ts";
import { pragueDayKey } from "../lib/games/days.ts";

/**
 * The game pass (§4.2) — the product half.
 *
 * The money itself is proved in `supabase/tests/game_pass.sql` (54 assertions,
 * including the Phase 1 wallet invariants re-run through the batch allocator)
 * and in `supabase/tests/concurrency/booking_race.mjs` (the last-spot and
 * double-spend races on batch wallets). What is proved HERE is that the pages
 * say what the contract requires them to say — above all, that the expiry is
 * on the screen before the button.
 *
 * EVERY SPEC CLEANS UP ITS OWN LEDGER ROWS. The seeded players are shared, and
 * a pass left in a wallet changes what every later booking spec pays.
 */

/**
 * Teardown, through the OWNER connection.
 *
 * A `.delete()` on `credit_topups` through the service client is refused
 * without raising — the table is append-only by privilege — so the first
 * version of this file left every top-up it created in the seed database, and
 * then failed on a `.single()` that found seven of them. See
 * `scaffold.resetWallet`.
 */
const clearWallet = resetWallet;

/*
 * REQ-PASS-001 — the six tiers, with the expiry stated before the button.
 */
test("the pass page lists every tier with its saving and its expiry", async ({ page }) => {
  await page.goto("/pass");

  const tiers = page.getByTestId("pass-tier");
  await expect(tiers).toHaveCount(6);

  // The 5-pass, as the contract prices it.
  const five = page.locator('[data-testid="pass-tier"][data-games="5"]');
  await expect(five.getByTestId("pass-tier-price")).toContainText("700");
  await expect(five.getByTestId("pass-tier-credited")).toContainText("750");
  await expect(five.getByTestId("pass-tier-saving")).toContainText("50");
  await expect(five.getByTestId("pass-tier-expiry")).toContainText("1 month");

  // The 1-game tier is deliberately not a discount, and does not expire.
  const one = page.locator('[data-testid="pass-tier"][data-games="1"]');
  await expect(one.getByTestId("pass-tier-price")).toContainText("150");
  await expect(one.getByTestId("pass-tier-expiry")).toContainText("Never");
  await expect(one.getByTestId("pass-tier-saving")).not.toContainText("Save");

  // EVERY tier states an expiry, above its button. §4.2: an expiry discovered
  // after purchase is a complaint; one read before it is a choice.
  for (const tier of await tiers.all()) {
    await expect(tier.getByTestId("pass-tier-expiry")).toBeVisible();
  }
});

/*
 * The tiers are readable signed out — the panel is on the games list, which a
 * visitor reaches from a shared link.
 */
test("a signed-out visitor can read the tiers and reach them from the games list", async ({
  page,
}) => {
  const game = await createScratchGame({ hoursFromNow: 24 * 25 });

  try {
    await page.goto(`/games?day=${pragueDayKey(game.startsAt)}`);
    const panel = page.getByTestId("pass-panel");
    await expect(panel).toBeVisible();

    // Between the day-picker and the list (§4.2), not below the fold.
    await panel.click();
    await page.waitForURL(/\/pass/);
    await expect(page.getByTestId("pass-tier")).toHaveCount(6);

    // And through the API, because a missing grant would render as "no tiers"
    // rather than as an error.
    const anon = anonClient();
    const { data } = await anon.from("pass_tiers").select("games");
    expect((data ?? []).length).toBe(6);
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * REQ-PASS-002 — buying lands on the standard QR, and an exact payment credits
 * the pass VALUE with an expiry.
 */
test("buying a pass lands on the QR, and an exact payment credits the pass value", async ({
  page,
  context,
}) => {
  await clearWallet(players.creditPartial.id);

  try {
    await signInAs(context, players.creditPartial);
    await page.goto("/pass");
    await page.getByTestId("buy-pass-5").click();

    // A pass is a top-up with a known amount: same screen, same 27-series VS.
    await page.waitForURL(/\/account\/topup\/[0-9a-f-]{36}/);
    await expect(page.getByTestId("qr-payment")).toBeVisible();

    const admin = serviceClient();
    const { data: topup } = await admin
      .from("credit_topups")
      .select("id, amount_czk, pass_games, payment_code")
      .eq("player_id", players.creditPartial.id)
      .single();

    expect(topup!.amount_czk).toBe(700);
    expect(topup!.pass_games).toBe(5);
    expect(String(topup!.payment_code).startsWith("27")).toBe(true);

    // Pending contributes nothing.
    const before = await balanceOf(players.creditPartial.id);
    expect(before).toBe(0);

    // Confirmed at exactly the pass price -> the pass VALUE, with an expiry.
    const { data: result, error } = await admin.rpc("confirm_topup", {
      p_topup_id: topup!.id,
      p_confirmed_by: players.organizer.id,
      p_received_amount_czk: 700,
    });
    expect(error).toBeNull();
    expect(result!.credited_czk).toBe(750);
    expect(await balanceOf(players.creditPartial.id)).toBe(750);

    // §4.2: /account shows BATCHES, not one opaque total.
    await page.goto("/account");
    const batches = page.getByTestId("credit-batch");
    await expect(batches).toHaveCount(1);
    await expect(batches.first()).toContainText("750");
    // The games-equivalent, which is why CZK works as the unit at all.
    await expect(batches.first()).toContainText("5 games");
  } finally {
    await clearWallet(players.creditPartial.id);
  }
});

/*
 * REQ-PASS-002, the other half — any other amount falls back to the standing
 * rule. A player who sends 690 against a 700 pass has made a top-up.
 */
test("a near-miss payment credits what arrived, with no expiry", async () => {
  await clearWallet(players.creditPartial.id);

  try {
    const player = await apiClientFor(players.creditPartial);
    const { data: topup } = await player.rpc("create_pass_topup", { p_pass_games: 5 });

    const admin = serviceClient();
    const { data: result } = await admin.rpc("confirm_topup", {
      p_topup_id: topup!.id,
      p_confirmed_by: players.organizer.id,
      p_received_amount_czk: 690,
    });

    expect(result!.credited_czk).toBe(690);
    expect(await balanceOf(players.creditPartial.id)).toBe(690);

    // No batch, so nothing expires.
    const { data: batches } = await admin
      .from("credit_ledger")
      .select("expires_at")
      .eq("player_id", players.creditPartial.id)
      .not("expires_at", "is", null);
    expect((batches ?? []).length).toBe(0);
  } finally {
    await clearWallet(players.creditPartial.id);
  }
});

/*
 * REQ-PASS-003 — the pass spends on a real booking, soonest-expiring first,
 * and a cancellation returns it to the batch it came from.
 */
test("pass credit books a game and a cancellation returns it to its batch", async () => {
  await clearWallet(players.creditPartial.id);
  const game = await createScratchGame({ capacity: 6, priceCzk: 200 });

  try {
    const admin = serviceClient();

    // A pass, plus ordinary credit that must NOT be touched first.
    const player = await apiClientFor(players.creditPartial);
    const { data: topup } = await player.rpc("create_pass_topup", { p_pass_games: 5 });
    await admin.rpc("confirm_topup", {
      p_topup_id: topup!.id,
      p_confirmed_by: players.organizer.id,
      p_received_amount_czk: 700,
    });
    await admin.rpc("grant_credit", {
      p_player_id: players.creditPartial.id,
      p_delta_czk: 500,
      p_note: "pass spec — ordinary credit",
    });

    expect(await balanceOf(players.creditPartial.id)).toBe(1250);

    const { data: booking, error } = await player.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
    });
    expect(error).toBeNull();
    expect(booking!.credit_applied_czk).toBe(200);

    // The BATCH paid, not the permanent credit.
    const { data: batchRows } = await admin.rpc("credit_batches", {
      p_player_id: players.creditPartial.id,
    });
    expect(batchRows![0].remaining_czk).toBe(550);

    // Cancel: it goes back to the batch, with the batch's expiry.
    const { error: cancelError } = await player.rpc("cancel_booking", {
      p_booking_id: booking!.id,
    });
    expect(cancelError).toBeNull();

    const { data: after } = await admin.rpc("credit_batches", {
      p_player_id: players.creditPartial.id,
    });
    expect(after![0].remaining_czk).toBe(750);
    expect(await balanceOf(players.creditPartial.id)).toBe(1250);

    // And nothing became never-expiring credit — that is the laundering route
    // §4.2 closes.
    const { data: loose } = await admin
      .from("credit_ledger")
      .select("id")
      .eq("player_id", players.creditPartial.id)
      .eq("reason", "cancellation_credit")
      .is("batch_id", null);
    expect((loose ?? []).length).toBe(0);
  } finally {
    await clearWallet(players.creditPartial.id);
    await destroyScratchGame(game.id);
  }
});

/*
 * REQ-PASS-004 — the sweep and the heads-up, through the cron route.
 *
 * Driven by the route rather than by the RPC, because the route is what
 * actually runs — and because its idempotency is the property worth proving:
 * Vercel Cron is at-least-once.
 */
test("the cron route warns once and expires once", async ({ request }) => {
  await clearWallet(players.creditPartial.id);
  const admin = serviceClient();
  const secret = process.env.CRON_SECRET;
  expect(secret, "CRON_SECRET must be set for this spec").toBeTruthy();

  try {
    /*
     * A REAL PASS, bought and confirmed through the product — then its expiry
     * is moved. The first version of this spec granted ordinary credit and
     * tried to stamp `expires_at` through PostgREST; `service_role` has no
     * UPDATE on `credit_ledger` at all, so that silently did nothing and the
     * route correctly reported nothing to warn about.
     *
     * `moveBatchExpiry` connects as the database owner, like every other
     * sweep spec, and moves a TIMESTAMP only.
     */
    const player = await apiClientFor(players.creditPartial);
    const { data: topup } = await player.rpc("create_pass_topup", { p_pass_games: 5 });
    await admin.rpc("confirm_topup", {
      p_topup_id: topup!.id,
      p_confirmed_by: players.organizer.id,
      p_received_amount_czk: 700,
    });

    const { data: row } = await admin
      .from("credit_ledger")
      .select("id")
      .eq("player_id", players.creditPartial.id)
      .not("expires_at", "is", null)
      .single();

    // Two days out: inside the three-day warning window.
    await moveBatchExpiry(row!.id, 2);

    const headers = { "x-cron-secret": secret! };

    const first = await request.get("/api/cron/pass-expiry", { headers });
    expect(first.ok()).toBeTruthy();
    const firstBody = await first.json();
    expect(firstBody.warned).toBeGreaterThanOrEqual(1);

    // Idempotent: the stamp was written by the same statement that selected it.
    const second = await request.get("/api/cron/pass-expiry", { headers });
    const secondBody = await second.json();
    expect(secondBody.warned).toBe(0);

    // Now move it into the past and sweep.
    await moveBatchExpiry(row!.id, -1);

    const third = await request.get("/api/cron/pass-expiry", { headers });
    const thirdBody = await third.json();
    expect(thirdBody.expired).toBeGreaterThanOrEqual(1);
    expect(await balanceOf(players.creditPartial.id)).toBe(0);

    // And a second sweep expires nothing.
    const fourth = await request.get("/api/cron/pass-expiry", { headers });
    expect((await fourth.json()).expired).toBe(0);
    expect(await balanceOf(players.creditPartial.id)).toBe(0);
  } finally {
    await clearWallet(players.creditPartial.id);
  }
});

/** Balance, computed the only way it ever is: SUM(delta_czk). */
async function balanceOf(playerId: string): Promise<number> {
  const admin = serviceClient();
  const { data } = await admin
    .from("credit_ledger")
    .select("delta_czk")
    .eq("player_id", playerId);
  return (data ?? []).reduce((sum, row) => sum + row.delta_czk, 0);
}
