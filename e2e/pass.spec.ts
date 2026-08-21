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
 * REQ-PASS-001 — the tiers, with the expiry stated before the button.
 */
test("the pass page lists every tier with its saving and its expiry", async ({ page }) => {
  await page.goto("/pass");

  const tiers = page.getByTestId("pass-tier");
  await expect(tiers).toHaveCount(5);

  /*
   * The 5-pass, as the contract prices it — and as the SALE treatment now
   * presents it: the per-game figure loudest, the price beside a struck
   * anchor of what five games cost bought one at a time, and the discount
   * after both.
   */
  const five = page.locator('[data-testid="pass-tier"][data-games="5"]');
  await expect(five.getByTestId("pass-tier-per-game")).toContainText("140");
  await expect(five.getByTestId("pass-tier-price")).toContainText("700");
  // 5 x 150. NOT `credited_czk` (750 here by coincidence of this tier) — the
  // anchor is what the games would have cost, which is a different claim.
  await expect(five.getByTestId("pass-tier-anchor")).toContainText("750");
  // Whole percent, rounded to nearest (owner's call): 6.66… renders as 7.
  await expect(five.getByTestId("pass-tier-discount")).toContainText("7");
  // The window is stated in DAYS now, derived from the tier's `expires_months`
  // — so the 1-month tiers say 30 and the 2-month tiers say 60, rather than
  // every card claiming 30.
  await expect(five.getByTestId("pass-tier-expiry")).toContainText("30 days");

  // The 20-pass, where the anchor and the credited value genuinely diverge:
  // 20 x 150 = 3,000 against a 2,300 price.
  const twenty = page.locator('[data-testid="pass-tier"][data-games="20"]');
  await expect(twenty.getByTestId("pass-tier-anchor")).toContainText("3,000");
  // Whole percent, rounded to nearest: 23.33… renders as 23.
  await expect(twenty.getByTestId("pass-tier-discount")).toContainText("23");

  // Exactly one tier is tagged, and it is the 12.
  await expect(page.getByTestId("pass-tier-popular")).toHaveCount(1);
  await expect(
    page.locator('[data-testid="pass-tier"][data-games="12"]'),
  ).toHaveAttribute("data-most-popular", "true");

  /*
   * THE 1-GAME TIER IS GONE (ruled 2026-08-02), and gone from the table rather
   * than hidden by the page. It was listed at par so the other discounts would
   * read as discounts; in practice it sat first, where the best offer belongs,
   * and offered nothing.
   */
  await expect(page.locator('[data-testid="pass-tier"][data-games="1"]')).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("The standard price");

  // Every remaining tier IS a discount, and states an expiry above its button.
  // §4.2: an expiry discovered after purchase is a complaint; one read before
  // it is a choice.
  for (const tier of await tiers.all()) {
    await expect(tier.getByTestId("pass-tier-expiry")).toBeVisible();
    // Every tier shows a struck anchor above its own price, so every tier
    // reads as a discount rather than as a price list.
    await expect(tier.getByTestId("pass-tier-anchor")).toBeVisible();
    await expect(tier.getByTestId("pass-tier-discount")).toContainText("%");
  }
});

/*
 * The floor is a CONSTRAINT, not a convention: filtering the tier out of the
 * page would leave `create_pass_topup(1)` working — a price list with a
 * second, invisible entry.
 */
test("a one-game pass cannot be bought through the RPC either", async () => {
  const player = await apiClientFor(players.runner);
  const { error } = await player.rpc("create_pass_topup", { p_pass_games: 1 });
  expect(error).not.toBeNull();
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
    await expect(page.getByTestId("pass-tier")).toHaveCount(5);

    // And through the API, because a missing grant would render as "no tiers"
    // rather than as an error.
    const anon = anonClient();
    const { data } = await anon.from("pass_tiers").select("games");
    expect((data ?? []).length).toBe(5);
  } finally {
    await destroyScratchGame(game.id);
  }
});

/*
 * REQ-PASS-002 — buying lands on the standard QR, and an exact payment credits
 * the pass VALUE with an expiry.
 */
/*
 * ~~"buying a pass lands on the QR, and an exact payment credits the pass
 * value"~~ REWRITTEN IN ROUND 13 (items 6-7).
 *
 * There is no QR screen. A pass is bought through a Stripe Payment Link and
 * confirmed by the signed webhook, exactly like an online booking — so the
 * two halves of the old test split: the BUTTON is asserted here, and the
 * CREDITING is asserted through `confirm_online_purchase` below, which is the
 * path the webhook actually takes.
 */
test("a tier with no Stripe link says so instead of selling itself wrong", async ({
  page,
  context,
}) => {
  await signInAs(context, players.creditPartial);
  await page.goto("/pass", { waitUntil: "networkidle" });

  /*
   * `NEXT_PUBLIC_STRIPE_PASS_URLS` is unset under the suite, so every tier is
   * unconfigured and every button is a "Coming soon" chip.
   *
   * THE IMPORTANT HALF IS WHAT IT DOES NOT DO. A tier without its own link
   * must never fall back to the single-game link: tier prices are DISCOUNTED,
   * so paying one through the per-game link charges the undiscounted price
   * even at the right quantity.
   */
  await expect(page.getByTestId("buy-pass-5-soon")).toBeVisible();
  await expect(page.getByTestId("buy-pass-5")).toHaveCount(0);
});

test("the webhook credits a pass purchase through the existing ledger path", async () => {
  await clearWallet(players.creditPartial.id);

  try {
    const player = await apiClientFor(players.creditPartial);
    const { data: topup, error: startError } = await player.rpc("begin_pass_purchase", {
      p_pass_games: 5,
    });
    expect(startError).toBeNull();
    expect(topup!.amount_czk).toBe(700);
    expect(topup!.pass_games).toBe(5);
    // The 27-series is what lets a bank statement tell a top-up from a
    // booking. It survives the rail change: it is the permanent identifier of
    // a payment, and history does not get rewritten because the till changed.
    expect(String(topup!.payment_code).startsWith("27")).toBe(true);
    expect(topup!.payment_pending_at).not.toBeNull();

    // Pending contributes nothing.
    expect(await balanceOf(players.creditPartial.id)).toBe(0);

    const admin = serviceClient();
    const { data: outcome, error } = await admin.rpc("confirm_online_purchase", {
      p_reference: topup!.id,
      p_session_id: "cs_pass_e2e_1",
      p_amount_czk: 700,
    });
    expect(error).toBeNull();
    expect(outcome).toBe("confirmed");

    // The PASS VALUE, not the price paid — `confirm_topup` owns that rule and
    // the webhook did not have to know it.
    expect(await balanceOf(players.creditPartial.id)).toBe(750);

    // Redelivery is a no-op, so a retried webhook cannot credit twice.
    const { data: again } = await admin.rpc("confirm_online_purchase", {
      p_reference: topup!.id,
      p_session_id: "cs_pass_e2e_1",
      p_amount_czk: 700,
    });
    expect(again).toBe("already");
    expect(await balanceOf(players.creditPartial.id)).toBe(750);
  } finally {
    await clearWallet(players.creditPartial.id);
  }
});


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

/*
 * THE CLARIFIED KEYING (§4.2, ruled 2026-08-02) — intent AND amount.
 *
 * Asserted through the ORDINARY TOP-UP PATH, because that is where the harm
 * would land: free entry admits 50–2000, so a player typing 700 into the
 * top-up form is entirely plausible. Under amount-only keying they would have
 * received 750 CZK carrying a one-month expiry they never agreed to — money
 * they meant to keep, quietly converted into money that runs out.
 */
test("an ordinary top-up of a tier amount is credited as typed, with no expiry", async () => {
  await clearWallet(players.creditPartial.id);

  try {
    const player = await apiClientFor(players.creditPartial);
    // The ordinary RPC, no tier — exactly what the top-up form calls.
    const { data: topup, error: createError } = await player.rpc("create_topup", {
      p_amount_czk: 700,
    });
    expect(createError).toBeNull();
    expect(topup!.pass_games).toBeNull();

    const admin = serviceClient();
    const { data: result } = await admin.rpc("confirm_topup", {
      p_topup_id: topup!.id,
      p_confirmed_by: players.organizer.id,
      p_received_amount_czk: 700,
    });

    // 700, never 750.
    expect(result!.credited_czk).toBe(700);
    expect(await balanceOf(players.creditPartial.id)).toBe(700);

    // And nothing expires.
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
 * The counterpart, so the pair reads as one rule: the SAME 700, against a
 * chosen 5-pass, still credits 750 with an expiry.
 */
test("a chosen 5-pass received at 700 still credits 750 with an expiry", async () => {
  await clearWallet(players.creditPartial.id);

  try {
    const player = await apiClientFor(players.creditPartial);
    const { data: topup } = await player.rpc("create_pass_topup", { p_pass_games: 5 });
    expect(topup!.pass_games).toBe(5);

    const admin = serviceClient();
    const { data: result } = await admin.rpc("confirm_topup", {
      p_topup_id: topup!.id,
      p_confirmed_by: players.organizer.id,
      p_received_amount_czk: 700,
    });

    expect(result!.credited_czk).toBe(750);

    const { data: batches } = await admin
      .from("credit_ledger")
      .select("expires_at")
      .eq("player_id", players.creditPartial.id)
      .not("expires_at", "is", null);
    expect((batches ?? []).length).toBe(1);
  } finally {
    await clearWallet(players.creditPartial.id);
  }
});
