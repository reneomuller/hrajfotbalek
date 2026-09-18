import { expect, test } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { czkToMinorUnits } from "../lib/payments/embeddedCheckout";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session";

/**
 * HOTFIX 2026-09-18 — EVERY TIER, NOT A TIER.
 *
 * THE OUTAGE THIS EXISTS TO PREVENT A REPEAT OF. The 15- and 20-game passes
 * could not be bought on production while 5, 8 and 12 could. `credit_topups`
 * capped `amount_czk` at 2000 CZK and round 35 v2 had priced those two tiers at
 * 2241 and 2772, so the split was exactly the ceiling. Every tile rendered, every
 * price was right, and the button answered "Something went wrong."
 *
 * WHY NOTHING CAUGHT IT. Every pass spec in the suite exercised ONE tier —
 * usually the cheapest, because that is what a fixture reaches for — and a
 * per-tier failure is invisible to all of them.
 *
 * WHY THIS DOES NOT CLICK THE BUTTON. `buyPassAction` checks
 * `embeddedCheckoutEnabled()` first, and the E2E environment has no Stripe keys
 * — so a click here returns `PASS_NOT_CONFIGURED` before `begin_pass_purchase`
 * is ever called. **A spec that clicked the button would have been just as blind
 * to this bug as the ones that already existed.** So it drives the RPC the
 * button calls, with a real authenticated session, and asserts separately that
 * the tile a player taps exists for the same tier.
 *
 * THE TIERS ARE READ FROM THE TABLE, never listed here. A sixth tier inserted
 * tomorrow is covered the day it is inserted, which is the property that was
 * missing.
 */

test.use({ viewport: { width: 390, height: 844 } });

interface Tier {
  games: number;
  price_czk: number;
  credited_czk: number;
}

async function liveTiers(): Promise<Tier[]> {
  const { data, error } = await serviceClient()
    .from("pass_tiers")
    .select("games, price_czk, credited_czk")
    .order("games");
  if (error) throw new Error(`pass_tiers: ${error.message}`);
  return (data ?? []) as Tier[];
}

test("EVERY tier in the table can actually be purchased", async () => {
  // Arrange
  const tiers = await liveTiers();
  expect(tiers.length, "the tier table is empty").toBeGreaterThanOrEqual(5);
  const client = await apiClientFor(players.runner);
  const admin = serviceClient();
  const created: string[] = [];

  try {
    // Act / Assert — one purchase per tier, named individually so a failure
    // says WHICH tier rather than "a tier".
    for (const tier of tiers) {
      const { data, error } = await client.rpc("begin_pass_purchase", {
        p_pass_games: tier.games,
      });

      expect(
        error?.message ?? null,
        `the ${tier.games}-game pass at ${tier.price_czk} CZK could not be purchased`,
      ).toBeNull();

      const row = data as { id: string; amount_czk: number; pass_games: number } | null;
      expect(row, `the ${tier.games}-game pass returned no row`).not.toBeNull();
      created.push(row!.id);

      // It is charged its OWN price — the bug's neighbour, where a tier sells
      // at another tier's amount.
      expect(
        row!.amount_czk,
        `the ${tier.games}-game pass was charged ${row!.amount_czk}, not ${tier.price_czk}`,
      ).toBe(tier.price_czk);
      expect(row!.pass_games).toBe(tier.games);

      /*
       * AND THE AMOUNT IS ONE STRIPE WOULD ACCEPT. This is the closest this
       * environment gets to session creation: `createEmbeddedSession` puts
       * `czkToMinorUnits(amountCzk)` into `unit_amount`, and Stripe requires a
       * positive integer. A tier priced at 22.41 would pass every check above
       * and fail at the card.
       */
      const minor = czkToMinorUnits(row!.amount_czk);
      expect(Number.isInteger(minor), `${tier.games}: unit_amount is not an integer`).toBe(true);
      expect(minor, `${tier.games}: unit_amount is not positive`).toBeGreaterThan(0);
    }
  } finally {
    if (created.length > 0) await admin.from("credit_topups").delete().in("id", created);
  }
});

test("every tier the table holds is on the page, with its own price", async ({ page, context }) => {
  /*
   * THE OTHER HALF OF THE DIVERGENCE. The purchase path and the display read
   * the same table, and this asserts they agree ROW BY ROW — a tile that exists
   * for a tier nobody can buy is the exact shape of the outage, and so is a
   * tier that sells but has no tile.
   */
  // Arrange
  const tiers = await liveTiers();
  await signInAs(context, players.runner);
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);

  // Act
  await page.goto("/pass", { waitUntil: "networkidle" });

  // Assert
  await expect(page.getByTestId("pass-tier")).toHaveCount(tiers.length);
  /*
   * DIGITS ONLY. The page prints "1,296 CZK" and Czech prints "1 296 Kč" with a
   * non-breaking space, so a search for "1296" finds neither. Stripping every
   * separator — commas, ordinary spaces, NBSP and the narrow NBSP the Czech
   * locale uses — compares the NUMBER rather than its typography, which is the
   * property this test is about.
   */
  const body = (await page.locator("body").innerText()).replace(/[\s,\u00a0\u202f\u2009]/g, "");
  for (const tier of tiers) {
    await expect(
      page.getByTestId(`buy-pass-${tier.games}`),
      `the ${tier.games}-game tier has no buy control`,
    ).toHaveCount(1);
    expect(
      body.replace(/ | |\s/g, ""),
      `the ${tier.games}-game tier does not show its price ${tier.price_czk}`,
    ).toContain(String(tier.price_czk));
  }
});
