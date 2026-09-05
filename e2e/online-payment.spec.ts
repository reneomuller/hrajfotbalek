import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session";
import {
  clearActiveBookings,
  createScratchGame,
  destroyScratchGame,
  expireOnlinePayment,
} from "./helpers/scaffold";

/**
 * ROUND 12 ITEM 5 — the back-arrow hole, closed end to end.
 *
 * THE BUG, STATED AS A SEQUENCE: choose Online, get a booking, get redirected
 * to Stripe, press the browser's back arrow. Before round 12 the seats stayed
 * held, unpaid, forever — nothing expired them, because `expires_at` is only
 * set by the nudge sweep twelve hours out.
 *
 * The SQL suite owns the arithmetic. This file owns the two things it cannot
 * see: that a real HTTP request to the webhook with a real signature confirms
 * a real booking, and that an unsigned one does not.
 *
 * THE WEBHOOK IS EXERCISED OVER HTTP, not by calling the handler. The single
 * commonest way a Stripe integration breaks is a framework parsing the body
 * before the signature is checked, and only a real request proves it did not.
 */

test.use({ viewport: { width: 390, height: 844 } });

const PRICE = 150;
const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

function signedEvent(sessionId: string, bookingId: string, amountMinor: number) {
  const payload = JSON.stringify({
    id: "evt_" + sessionId,
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        client_reference_id: bookingId,
        amount_total: amountMinor,
        currency: "czk",
      },
    },
  });
  const at = Math.floor(Date.now() / 1000);
  const mac = createHmac("sha256", SECRET).update(`${at}.${payload}`, "utf8").digest("hex");
  return { payload, header: `t=${at},v1=${mac}` };
}

/*
 * Every test here needs the secret, because the point of the endpoint is that
 * it refuses everything without one. Skipping loudly beats a green run that
 * asserted nothing — the suite would otherwise report success on the one
 * feature that touches money.
 */
test.skip(!SECRET, "STRIPE_WEBHOOK_SECRET is not set for the test run");

/*
 * ~~"an online booking holds its seats, then stops, without a sweep"~~
 * INVERTED (round 26, item 1).
 *
 * That test pinned the thirty-minute hold: a pending booking held its party's
 * seats and then silently stopped. Pay-first deleted the state — the webhook
 * creates the booking, already paid — so what remains is the LEGACY rail, and
 * the property worth asserting is the opposite one.
 *
 * A legacy hold keeps its seats. It is a real arrangement from before this
 * round, and a clock taking it away is the defect round 25 spent a migration
 * cleaning up after. The pay-first path has its own tests in `round26.spec.ts`.
 */
test("a legacy online hold keeps its seats, and nothing awaits payment", async ({
  page,
  context,
}) => {
  const game = await createScratchGame({ capacity: 6, priceCzk: PRICE });
  try {
    await clearActiveBookings("runner");
    await signInAs(context, players.runner);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);

    const admin = serviceClient();
    const asRunner = await apiClientFor(players.runner);
    const { data: booking } = await asRunner.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "qr",
      p_guest_count: 1,
      p_online: true,
    });
    expect(booking).toBeTruthy();

    const seats = async () =>
      (await admin.rpc("game_seats_taken", { p_game_id: game.id })).data;

    expect(await seats(), "a legacy hold does not hold its party's seats").toBe(2);

    // Age the stamp past what used to be the window.
    await expireOnlinePayment((booking as { id: string }).id);

    expect(
      await seats(),
      "a clock took a legacy hold's seats away — the round-25 defect, returned",
    ).toBe(2);

    /*
     * AND NOTHING AWAITS PAYMENT. The panel described a state pay-first cannot
     * produce; the booking panel that survived is the one that was always
     * true.
     */
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("awaiting-payment")).toHaveCount(0);
    await expect(page.getByTestId("your-booking")).toBeVisible();
  } finally {
    await clearActiveBookings("runner");
    await destroyScratchGame(game.id);
  }
});

test("the webhook confirms a booking, and a redelivery changes nothing", async ({ request }) => {
  const game = await createScratchGame({ capacity: 6, priceCzk: PRICE });
  try {
    await clearActiveBookings("runner");
    const admin = serviceClient();
    const asRunner = await apiClientFor(players.runner);
    const { data: booking } = await asRunner.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "qr",
      p_guest_count: 1,
      p_online: true,
    });
    const bookingId = (booking as { id: string }).id;

    const { payload, header } = signedEvent("cs_e2e_1", bookingId, PRICE * 2 * 100);

    const first = await request.post("/api/stripe/webhook", {
      headers: { "stripe-signature": header, "content-type": "application/json" },
      data: payload,
    });
    expect(first.status()).toBe(200);
    expect((await first.json()).outcome).toBe("confirmed");

    const { data: after } = await admin
      .from("bookings")
      .select("status, payment_pending_at, stripe_session_id")
      .eq("id", bookingId)
      .single();
    expect(after?.status).toBe("confirmed");
    expect(after?.payment_pending_at).toBeNull();
    expect(after?.stripe_session_id).toBe("cs_e2e_1");

    // REDELIVERY. Stripe retries until it gets a 2xx and may deliver twice.
    const again = signedEvent("cs_e2e_1", bookingId, PRICE * 2 * 100);
    const second = await request.post("/api/stripe/webhook", {
      headers: { "stripe-signature": again.header, "content-type": "application/json" },
      data: again.payload,
    });
    expect(second.status()).toBe(200);
    expect((await second.json()).outcome).toBe("already");

    // One confirmation, one event — not two.
    const { data: events } = await admin
      .from("events")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("event_type", "payment_confirmed");
    expect(events).toHaveLength(1);
  } finally {
    await clearActiveBookings("runner");
    await destroyScratchGame(game.id);
  }
});

test("the webhook refuses an unsigned or wrongly-signed request", async ({ request }) => {
  const { payload, header } = signedEvent(
    "cs_e2e_forged",
    "11111111-1111-1111-1111-111111111111",
    15000,
  );

  // No signature at all.
  const bare = await request.post("/api/stripe/webhook", {
    headers: { "content-type": "application/json" },
    data: payload,
  });
  expect(bare.status(), "an unsigned POST is refused").toBe(400);

  // A signature over a DIFFERENT body — the shape of a tampered payload.
  const tampered = await request.post("/api/stripe/webhook", {
    headers: { "stripe-signature": header, "content-type": "application/json" },
    data: payload.replace("cs_e2e_forged", "cs_e2e_swapped"),
  });
  expect(tampered.status(), "a tampered body is refused").toBe(400);

  // A signature made with somebody else's secret.
  const at = Math.floor(Date.now() / 1000);
  const wrong = createHmac("sha256", "whsec_not_ours")
    .update(`${at}.${payload}`, "utf8")
    .digest("hex");
  const forged = await request.post("/api/stripe/webhook", {
    headers: { "stripe-signature": `t=${at},v1=${wrong}`, "content-type": "application/json" },
    data: payload,
  });
  expect(forged.status(), "a foreign secret is refused").toBe(400);
});

test("an underpayment is flagged for a human, never seated", async ({ request }) => {
  const game = await createScratchGame({ capacity: 6, priceCzk: PRICE });
  try {
    await clearActiveBookings("runner");
    const admin = serviceClient();
    const asRunner = await apiClientFor(players.runner);
    const { data: booking } = await asRunner.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "qr",
      p_guest_count: 2,
      p_online: true,
    });
    const bookingId = (booking as { id: string }).id;

    // A party of three owes 450; this pays for one. The realistic cause is
    // "adjustable quantity" left at 1 on the payment link.
    const { payload, header } = signedEvent("cs_e2e_short", bookingId, PRICE * 100);
    const response = await request.post("/api/stripe/webhook", {
      headers: { "stripe-signature": header, "content-type": "application/json" },
      data: payload,
    });

    expect(response.status()).toBe(200);
    expect((await response.json()).outcome).toBe("attention");

    const { data: after } = await admin
      .from("bookings")
      .select("status, payment_attention_at, payment_attention_reason")
      .eq("id", bookingId)
      .single();
    expect(after?.status, "an underpaid party is not confirmed").toBe("reserved");
    expect(after?.payment_attention_at).not.toBeNull();
    expect(after?.payment_attention_reason).toContain("150");
  } finally {
    await clearActiveBookings("runner");
    await destroyScratchGame(game.id);
  }
});
