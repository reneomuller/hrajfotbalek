import { expect, test } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { PASS_REFERENCE_PRICE_CZK } from "../lib/pass/creditPrice";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session";
import { createScratchGame, destroyScratchGame, setWalletTo } from "./helpers/scaffold";

/**
 * ROUND 35 v2 — items 4, 5, 6, 8 and 9.
 *
 * Items 2 and 3 are proved by `lib/pass/__tests__/seatPrice.test.ts` (the sweep)
 * and `supabase/tests/credits_are_seats.sql`; the pass table's own numbers are
 * asserted here, because a price the migration wrote and the page does not
 * render is a migration nobody can see.
 */

test.use({ viewport: { width: 390, height: 844 } });

async function asAdmin(context: import("@playwright/test").BrowserContext) {
  await signInAs(context, players.organizer);
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);
}

// =============================================================================
// ITEM 3 — the pass table, as the owner gave it
// =============================================================================

test("the pass page sells the owner's five tiers at the owner's five prices", async ({
  page,
  context,
}) => {
  await signInAs(context, players.runner);
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);

  await page.goto("/pass", { waitUntil: "networkidle" });

  /*
   * THE PRICES ARE THE RULING; THE PERCENTAGES ARE COMPUTED FROM THEM. Both are
   * asserted, because the computation is the part that could silently disagree:
   * `PassTierCard` derives the discount from the anchor, and the anchor derives
   * from `PASS_REFERENCE_PRICE_CZK`. If the constant and the tiers ever part
   * company the percentages move and the prices do not.
   */
  const expected = [
    { games: 5, price: 840, anchor: 5 * 180, pct: 7 },
    { games: 8, price: 1296, anchor: 8 * 180, pct: 10 },
    { games: 12, price: 1879, anchor: 12 * 180, pct: 13 },
    { games: 15, price: 2241, anchor: 15 * 180, pct: 17 },
    { games: 20, price: 2772, anchor: 20 * 180, pct: 23 },
  ];

  for (const tier of expected) {
    const card = page.locator(`[data-testid="pass-tier"][data-games="${tier.games}"]`);
    await expect(card, `no card for the ${tier.games}-game tier`).toHaveCount(1);
    /*
     * SEPARATORS STRIPPED BEFORE COMPARING. The page renders "1,296 CZK" —
     * `formatCzk` groups thousands, and the discount is "−7 %" with a thin
     * space before the sign. Asserting the grouped, spaced form would be
     * asserting the locale's punctuation rather than the price, and it would
     * fail the day the locale changes without anything being wrong.
     */
    const text = (await card.innerText()).replace(/[\s\u00a0\u202f,]/g, "");

    expect(text, `the ${tier.games}-tier price`).toContain(String(tier.price));
    expect(text, `the ${tier.games}-tier anchor`).toContain(String(tier.anchor));
    expect(text, `the ${tier.games}-tier discount`).toContain(`−${tier.pct}%`);
  }

  // And the anchor really is the seat price, not a number that happens to match.
  expect(PASS_REFERENCE_PRICE_CZK).toBe(180);
});

// =============================================================================
// ITEM 5 — the admin counts move on a booking AND on its guests
// =============================================================================

test("a booking with two guests moves the admin numbers immediately", async ({
  page,
  context,
}) => {
  const game = await createScratchGame({ capacity: 12, hoursFromNow: 24 * 9 });
  try {
    await asAdmin(context);

    // Before: nobody.
    await page.goto(`/admin/games/${game.id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("admin-capacity")).toHaveText("0/12");

    // One booking, two guests — three seats.
    const client = await apiClientFor(players.runner);
    const made = await client.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
      p_guest_count: 2,
    });
    expect(made.error, `create_booking: ${made.error?.message}`).toBeNull();

    /*
     * IMMEDIATELY, which is the half of the owner's report that was not about
     * guests. The count read zero for every game while the RPC behind it was
     * missing — so this asserts the number MOVES, not merely that it is
     * eventually right.
     */
    await page.goto(`/admin/games/${game.id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("admin-capacity")).toHaveText("3/12");

    await page.goto("/admin/games", { waitUntil: "networkidle" });
    const row = page.locator(`[data-testid="admin-game-row"][data-game-id="${game.id}"]`);
    await expect(row.getByTestId("admin-game-capacity")).toHaveText("3/12");
  } finally {
    await destroyScratchGame(game.id);
  }
});

// =============================================================================
// ITEM 4 — a cancelled game deletes
// =============================================================================

test("a cancelled game can be deleted, and a live one still cannot", async ({
  page,
  context,
}) => {
  const game = await createScratchGame({ capacity: 12, hoursFromNow: 24 * 8 });
  const admin = serviceClient();
  let deleted = false;
  try {
    const client = await apiClientFor(players.runner);
    const made = await client.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
    });
    expect(made.error).toBeNull();

    const organizer = await apiClientFor(players.organizer);

    // A live booking still blocks — the guard was never the problem.
    const blocked = await organizer.rpc("admin_delete_game", { p_game_id: game.id });
    expect(blocked.error?.message ?? "").toContain("GAME_HAS_BOOKINGS");

    // Cancel, then delete — which is what the refusal's own advice said to do
    // and what used to change nothing at all.
    const cancelled = await organizer.rpc("cancel_game_with_reason", {
      p_game_id: game.id,
      p_reason: "round 35 v2 spec",
    });
    expect(cancelled.error, `cancel_game: ${cancelled.error?.message}`).toBeNull();

    const gone = await organizer.rpc("admin_delete_game", { p_game_id: game.id });
    expect(gone.error, `admin_delete_game: ${gone.error?.message}`).toBeNull();
    deleted = true;

    const { data: rows } = await admin.from("games").select("id").eq("id", game.id);
    expect(rows ?? []).toEqual([]);

    await asAdmin(context);
    await page.goto("/admin/games", { waitUntil: "networkidle" });
    await expect(
      page.locator(`[data-testid="admin-game-row"][data-game-id="${game.id}"]`),
    ).toHaveCount(0);
  } finally {
    if (!deleted) await destroyScratchGame(game.id);
  }
});

// =============================================================================
// ITEM 6 — every country has a flag, and it is a circle
// =============================================================================

test("a country outside the original four renders a flag, in a circle", async ({
  page,
  context,
}) => {
  const admin = serviceClient();
  const { data: before } = await admin
    .from("players")
    .select("country")
    .eq("id", players.runner.id)
    .single();
  const original = (before as { country: string | null }).country;

  try {
    // Portugal: the country row 212 named as the one that rendered nothing.
    await admin.from("players").update({ country: "PT" }).eq("id", players.runner.id);

    await signInAs(context, players.runner);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);

    const { data: me } = await admin
      .from("players")
      .select("nickname")
      .eq("id", players.runner.id)
      .single();

    await page.goto(`/player/${encodeURIComponent((me as { nickname: string }).nickname)}`, {
      waitUntil: "networkidle",
    });

    const flag = page.getByTestId("country-flag").first();
    await expect(flag).toBeVisible();
    await expect(flag).toHaveAttribute("data-country", "PT");

    /*
     * A CIRCLE, MEASURED. `rounded-full` is a class and a class is not a shape;
     * what makes it a circle is a square box with a radius of half its width,
     * which is what the computed style says.
     */
    const box = await flag.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return { w: r.width, h: r.height, radius: s.borderRadius, overflow: s.overflow };
    });
    expect(Math.round(box.w), "the flag is not square").toBe(Math.round(box.h));
    expect(box.w, "the pinned profile size is 18px").toBe(18);
    expect(box.overflow, "nothing clips the flag to the circle").toBe("hidden");
    expect(parseFloat(box.radius), "the radius is not at least half the width")
      .toBeGreaterThanOrEqual(box.w / 2);

    // And the image inside it actually loaded — a 404 renders an empty circle.
    const loaded = await flag
      .locator("img")
      .evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0);
    expect(loaded, "the flag image did not load").toBe(true);
  } finally {
    await admin.from("players").update({ country: original }).eq("id", players.runner.id);
  }
});

// =============================================================================
// ITEM 9 — the admin players list shows faces
// =============================================================================

test("the admin players list shows an avatar, with initials as the fallback", async ({
  page,
  context,
}) => {
  await asAdmin(context);
  await page.goto("/admin/players", { waitUntil: "networkidle" });

  const tiles = page.getByTestId("admin-player-tile");
  await expect(tiles.first()).toBeVisible();

  /*
   * EVERY ROW HAS A TILE, and each one is either a photograph or initials —
   * never empty. Asserted over the whole list rather than on the first row,
   * because the fallback is the case that breaks quietly.
   */
  const states = await tiles.evaluateAll((els) =>
    els.map((el) =>
      el.querySelector("img") ? "photo" : (el.textContent ?? "").trim() ? "initials" : "empty",
    ),
  );
  expect(states.length).toBeGreaterThan(0);
  expect(states.filter((s) => s === "empty"), "a row has neither a face nor initials").toEqual([]);
});

// =============================================================================
// ITEM 8 — the ban
// =============================================================================

test("banning cancels the future booking, frees the seat, and blocks the account", async ({
  page,
  context,
}) => {
  const game = await createScratchGame({ capacity: 12, hoursFromNow: 24 * 7 });
  const admin = serviceClient();
  const target = players.creditPartial;
  try {
    await setWalletTo(target.id, 0);
    const client = await apiClientFor(target);
    const made = await client.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
      p_guest_count: 1,
    });
    expect(made.error, `create_booking: ${made.error?.message}`).toBeNull();

    await asAdmin(context);
    await page.goto(`/admin/players/${target.id}`, { waitUntil: "networkidle" });

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("ban-player").click();

    // The server's next render is the assertion — the toggle flips.
    await expect(page.getByTestId("unban-player")).toBeVisible();
    await expect(page.getByTestId("player-banned-notice")).toBeVisible();

    const { data: row } = await admin
      .from("bookings")
      .select("status")
      .eq("game_id", game.id)
      .eq("player_id", target.id)
      .single();
    expect((row as { status: string }).status, "the future booking survived the ban").toBe(
      "cancelled",
    );

    // Both seats are free, which the player-facing page must agree with.
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("spots-left").first()).toContainText("12");

    // And the banned player cannot act.
    const banned = await apiClientFor(target);
    const refused = await banned.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
    });
    expect(refused.error?.message ?? "", "a banned player could still book").toContain(
      "INSUFFICIENT_PERMISSION",
    );

    // Unban restores access and leaves the cancellation alone.
    await page.goto(`/admin/players/${target.id}`, { waitUntil: "networkidle" });
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("unban-player").click();
    await expect(page.getByTestId("ban-player")).toBeVisible();

    const { data: after } = await admin
      .from("bookings")
      .select("status")
      .eq("game_id", game.id)
      .eq("player_id", target.id)
      .single();
    expect((after as { status: string }).status).toBe("cancelled");
  } finally {
    await admin.from("players").update({ banned_at: null }).eq("id", target.id);
    await admin.from("banned_phones").delete().eq("player_id", target.id);
    await destroyScratchGame(game.id);
  }
});
