import { expect, test } from "@playwright/test";
import { apiClientFor, players, serviceClient } from "./helpers/session";
import {
  createScratchGame,
  destroyScratchGame,
  setWalletTo,
  walletBalance,
} from "./helpers/scaffold";

/**
 * ROUND 27, ITEM 1 — the outage, and the rule it was fixed alongside.
 *
 * THE OUTAGE ITSELF IS NOT DRIVEN HERE and cannot be: it was a Next runtime
 * refusal (`Cookies can only be modified in a Server Action or Route Handler`)
 * on a page that needs a Stripe secret key to reach. What is asserted here is
 * the rule the owner attached to the fix — **choosing Online payment moves
 * ZERO credit** — at the layer where money actually moves, which is
 * `settle_checkout_session` rather than any page.
 *
 * The party arithmetic that used to live inline in that page is now
 * `lib/payments/partyAmount.ts` and is asserted by the unit suite, including
 * the `+2` case, because reaching it through the product needs the key this
 * environment does not have.
 */

const RUN = `r27${Date.now().toString(36)}`;

/** What `/payment/checkout` writes when it puts a form on screen. */
async function openCheckout(
  who: (typeof players)[keyof typeof players],
  gameId: string,
  sessionId: string,
  amountCzk: number,
  guests = 0,
) {
  const client = await apiClientFor(who);
  const { error } = await client.rpc("open_checkout", {
    p_game_id: gameId,
    p_guest_count: guests,
    p_stripe_session_id: sessionId,
    p_amount_czk: amountCzk,
  });
  expect(error, `open_checkout: ${error?.message}`).toBeNull();
}

/** The webhook's call, exactly. */
async function settle(stripeSessionId: string, amountCzk: number) {
  const { data, error } = await serviceClient().rpc("settle_checkout_session", {
    p_stripe_session_id: stripeSessionId,
    p_amount_czk: amountCzk,
  });
  expect(error, `settle_checkout_session: ${error?.message}`).toBeNull();
  return data as string;
}

test("paying online never spends the wallet, however full it is", async () => {
  // Arrange — a player who could have paid with credit, and chose not to.
  const game = await createScratchGame({ capacity: 8, priceCzk: 150 });
  const buyer = players.creditRich;
  await setWalletTo(buyer.id, 1_000);
  const before = await walletBalance(buyer.id);
  expect(before, "the arrangement itself").toBe(1_000);

  try {
    const sessionId = `cs_${RUN}_online_full_wallet`;

    // Act — the pay-first rail, end to end, as the webhook drives it.
    await openCheckout(buyer, game.id, sessionId, 150);
    const outcome = await settle(sessionId, 150);

    // Assert — a seat was taken and the wallet is untouched.
    expect(outcome).toBe("booked");
    expect(
      await walletBalance(buyer.id),
      "online payment moved wallet credit",
    ).toBe(1_000);

    const { data } = await serviceClient()
      .from("bookings")
      .select("credit_applied_czk, price_czk, guest_count")
      .eq("game_id", game.id)
      .eq("player_id", buyer.id)
      .maybeSingle();

    const booking = data as {
      credit_applied_czk: number;
      price_czk: number;
      guest_count: number;
    } | null;

    expect(booking, "the webhook made no booking").not.toBeNull();
    /*
     * THE RULE, STATED ON THE ROW. A booking born of an online payment carries
     * no wallet contribution at all — not a partial one, not a rounded one.
     * The wallet moves on an explicit Redeem-credit booking and nowhere else.
     */
    expect(booking?.credit_applied_czk).toBe(0);
  } finally {
    await destroyScratchGame(game.id);
    await setWalletTo(buyer.id, 0);
  }
});

test("a party pays for every seat online, and still spends no credit", async () => {
  // Arrange
  const game = await createScratchGame({ capacity: 8, priceCzk: 150 });
  const buyer = players.creditRich;
  await setWalletTo(buyer.id, 1_000);

  try {
    const sessionId = `cs_${RUN}_online_party_two`;
    // The amount the checkout page computes for +2: 150 × (1 + 2).
    const amountCzk = 450;

    // Act
    await openCheckout(buyer, game.id, sessionId, amountCzk, 2);
    const outcome = await settle(sessionId, amountCzk);

    // Assert
    expect(outcome).toBe("booked");

    const { data } = await serviceClient()
      .from("bookings")
      .select("credit_applied_czk, guest_count")
      .eq("game_id", game.id)
      .eq("player_id", buyer.id)
      .maybeSingle();

    const booking = data as {
      credit_applied_czk: number;
      guest_count: number;
    } | null;

    expect(booking?.guest_count, "the guests did not survive the payment").toBe(2);
    expect(booking?.credit_applied_czk).toBe(0);
    expect(await walletBalance(buyer.id)).toBe(1_000);
  } finally {
    await destroyScratchGame(game.id);
    await setWalletTo(buyer.id, 0);
  }
});
