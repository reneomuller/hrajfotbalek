import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session";
import { createScratchGame, destroyScratchGame, setWalletTo, walletBalance } from "./helpers/scaffold";

/**
 * ROUND 34 — items 1, 3 and 4. Item 2's law is `e2e/vocabulary.spec.ts` plus
 * the string-table walk in `lib/i18n/__tests__/vocabulary.test.ts`.
 *
 * Every spec builds its own game and tears it down; the seed tableau is read,
 * never mutated.
 */

test.use({ viewport: { width: 390, height: 844 } });

async function asRunner(
  context: import("@playwright/test").BrowserContext,
  who: keyof typeof players = "runner",
) {
  await signInAs(context, players[who]);
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
  ]);
}

/** A confirmed booking with N guests, made the way the product makes one. */
async function bookWithGuests(gameId: string, guests: number, who: keyof typeof players) {
  const client = await apiClientFor(players[who]);
  const { data, error } = await client.rpc("create_booking", {
    p_game_id: gameId,
    p_payment_method: "cash",
    p_guest_count: guests,
  });
  if (error) throw new Error(`create_booking: ${error.message}`);
  const made = data as { id: string; price_czk: number; status: string };

  /*
   * PAID. A player whose credit covered the party is ALREADY confirmed —
   * `create_booking` applies the wallet inside its own transaction — and
   * confirming again is an `INVALID_TRANSITION`. So this asks what the RPC
   * decided rather than assuming, which is the same rule the confirmation page
   * follows: branch on the derived state, never on what was sent.
   *
   * `service_role` deliberately has no UPDATE on `bookings`, so the payment
   * goes through the admin RPC the organizer would actually use.
   */
  if (made.status !== "confirmed") {
    const admin = await apiClientFor(players.organizer);
    const confirmed = await admin.rpc("confirm_booking", {
      p_booking_id: made.id,
      p_confirmed_by: players.organizer.id,
      p_received_amount_czk: made.price_czk,
    });
    if (confirmed.error) throw new Error(`confirm_booking: ${confirmed.error.message}`);
  }
  return made.id;
}

// =============================================================================
// ITEM 1 — the dropdown cue is a TRIANGLE
// =============================================================================

test("the dropdown's cue is a downward triangle, not a dot", async ({ page, context }) => {
  /*
   * DECODED, NOT ASSERTED ABOUT THE MARKUP. "There is an SVG" would have passed
   * for the `▾` character too — the complaint was about the SHAPE, and the only
   * way to check a shape is to look at the pixels.
   *
   * A DOWNWARD TRIANGLE IS WIDE AT THE TOP AND POINTED AT THE BOTTOM. So: count
   * lit pixels per row across the glyph's box and require the top row to carry
   * several times what the bottom row does. A dot, a square and an upward
   * triangle all fail that; nothing else this control could render passes it.
   */
  const game = await createScratchGame({ capacity: 20, hoursFromNow: 24 * 21 });
  try {
    await asRunner(context);
    await page.goto(`/game/${game.id}/book`, { waitUntil: "networkidle" });

    const caret = page.getByTestId("party-more-caret");
    await expect(caret).toBeVisible();

    const box = (await caret.boundingBox())!;
    expect(box.width, "the cue has no width").toBeGreaterThan(4);

    const png = PNG.sync.read(
      await page.screenshot({
        clip: { x: box.x, y: box.y, width: box.width, height: box.height },
      }),
    );

    // The control is volt-or-muted on a dark ground, so "lit" is simply
    // brighter than the surface behind it.
    const litInRow = (y: number) => {
      let n = 0;
      for (let x = 0; x < png.width; x++) {
        const i = (png.width * y + x) << 2;
        const luminance = (png.data[i]! + png.data[i + 1]! + png.data[i + 2]!) / 3;
        if (luminance > 90) n++;
      }
      return n;
    };

    const top = litInRow(Math.max(0, Math.round(png.height * 0.15)));
    const bottom = litInRow(Math.min(png.height - 1, Math.round(png.height * 0.85)));

    expect(top, "nothing is drawn at the top of the cue").toBeGreaterThan(2);
    expect(
      top,
      `the cue is ${top}px wide at the top and ${bottom}px at the bottom — ` +
        `that is not a downward triangle`,
    ).toBeGreaterThan(bottom * 2);

    /*
     * AND THE OTHER PICKER, because the owner named both. It is the same
     * component, so this is a wiring check rather than a second shape check —
     * what could break is one surface being left on the old glyph, not the
     * triangle being drawn differently in two places.
     */
    const booked = await apiClientFor(players.runner);
    const made = await booked.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
    });
    expect(made.error, `create_booking: ${made.error?.message}`).toBeNull();
    const admin = await apiClientFor(players.organizer);
    await admin.rpc("confirm_booking", {
      p_booking_id: (made.data as { id: string }).id,
      p_confirmed_by: players.organizer.id,
      p_received_amount_czk: (made.data as { price_czk: number }).price_czk,
    });

    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("add-guests-more-caret")).toBeVisible();
  } finally {
    await destroyScratchGame(game.id);
  }
});

// =============================================================================
// ITEM 3 — both add-guest rails end on BOOKING CONFIRMED
// =============================================================================

test("the CREDIT rail lands on the confirmation, naming the guests", async ({ page, context }) => {
  const game = await createScratchGame({ capacity: 20, priceCzk: 150, hoursFromNow: 24 * 20 });
  try {
    const bookingId = await bookWithGuests(game.id, 0, "creditRich");
    await setWalletTo(players.creditRich.id, 900);
    await asRunner(context, "creditRich");

    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("add-guests")).toBeVisible();
    await page.getByTestId("add-guests-pick-2").click();
    await page.getByTestId("add-guests-credit").click();

    // Assert on where the SERVER put them, not on a client marker.
    await page.waitForURL(/\/book\/confirmation\?/);
    await expect(page.getByTestId("booking-confirmed")).toBeVisible();
    await expect(page.getByTestId("confirmed-headline")).toHaveText("+2 guests confirmed");
    expect(new URL(page.url()).searchParams.get("booking")).toBe(bookingId);
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("the ONLINE rail lands on the same confirmation, through the webhook's own settle", async ({
  page,
  context,
}) => {
  /*
   * THE WEBHOOK PATH WITHOUT STRIPE. Everything after the card is this
   * product's: `open_add_guests_checkout` registers the intent, the webhook
   * calls `settle_checkout_session`, and `/payment/return` reads the register
   * row back. Driving the middle step directly exercises the exact code the
   * webhook runs — the only thing not covered is Stripe's own redirect, which
   * is a URL Stripe builds and this suite cannot make it build.
   */
  const game = await createScratchGame({ capacity: 20, priceCzk: 150, hoursFromNow: 24 * 19 });
  const sessionId = `cs_test_r34_${Date.now()}`;
  const admin = serviceClient();
  try {
    const bookingId = await bookWithGuests(game.id, 0, "runner");

    const runner = await apiClientFor(players.runner);
    const opened = await runner.rpc("open_add_guests_checkout", {
      p_booking_id: bookingId,
      p_guest_count: 3,
      p_stripe_session_id: sessionId,
      p_amount_czk: 450,
    });
    expect(opened.error, `open_add_guests_checkout: ${opened.error?.message}`).toBeNull();

    const settled = await admin.rpc("settle_checkout_session", {
      p_stripe_session_id: sessionId,
      p_amount_czk: 450,
    });
    expect(settled.error, `settle_checkout_session: ${settled.error?.message}`).toBeNull();
    expect(settled.data).toBe("booked");

    await asRunner(context);
    await page.goto(`/payment/return?session_id=${sessionId}`, { waitUntil: "networkidle" });

    await page.waitForURL(/\/book\/confirmation\?/, { timeout: 20_000 });
    await expect(page.getByTestId("booking-confirmed")).toBeVisible();
    await expect(page.getByTestId("confirmed-headline")).toHaveText("+3 guests confirmed");
  } finally {
    await admin.from("checkout_sessions").delete().eq("stripe_session_id", sessionId);
    await destroyScratchGame(game.id);
  }
});

// =============================================================================
// ITEM 4 — a player takes their own guests back off
// =============================================================================

test("removing guests frees the seats, returns credits, and never touches the player's own spot", async ({
  page,
  context,
}) => {
  const game = await createScratchGame({ capacity: 12, priceCzk: 150, hoursFromNow: 24 * 18 });
  const admin = serviceClient();
  try {
    const bookingId = await bookWithGuests(game.id, 3, "runner");
    await setWalletTo(players.runner.id, 0);
    await asRunner(context);

    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("cancel-guests")).toBeVisible();

    // Inside the window, so the panel promises credits rather than warning.
    await expect(page.getByTestId("cancel-guests-refund")).toBeVisible();
    await expect(page.getByTestId("cancel-guests-forfeit")).toHaveCount(0);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("cancel-guests-pick-2").click();
    await page.getByTestId("cancel-guests-submit").click();

    await page.waitForURL(/\?removed=2/);

    // The database is the assertion, not a toast.
    const { data: row } = await admin
      .from("bookings")
      .select("guest_count, status, price_czk")
      .eq("id", bookingId)
      .single();
    const booking = row as { guest_count: number; status: string; price_czk: number };

    expect(booking.guest_count, "the guests did not come off").toBe(1);
    expect(booking.status, "THE PLAYER'S OWN SPOT WAS CANCELLED").toBe("confirmed");
    expect(booking.price_czk, "the remaining price is not what two seats are worth").toBe(300);
    expect(await walletBalance(players.runner.id)).toBe(300);

    // ...and the page the player is looking at agrees. Capacity 12, a booking
    // holding two seats, so ten are free.
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("cancel-guests")).toBeVisible();
    const spots = await page.getByTestId("spots-left").first().innerText();
    expect(spots, `the spots figure reads "${spots}"`).toMatch(/\b10\b/);
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("removing the LAST guest leaves the player in the game", async ({ page, context }) => {
  const game = await createScratchGame({ capacity: 12, priceCzk: 150, hoursFromNow: 24 * 17 });
  const admin = serviceClient();
  try {
    const bookingId = await bookWithGuests(game.id, 1, "runner");
    await asRunner(context);

    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("cancel-guests-pick-1").click();
    await page.getByTestId("cancel-guests-submit").click();
    await page.waitForURL(/\?removed=1/);

    const { data: row } = await admin
      .from("bookings")
      .select("guest_count, status")
      .eq("id", bookingId)
      .single();
    expect(row as { guest_count: number; status: string }).toMatchObject({
      guest_count: 0,
      status: "confirmed",
    });

    // And the panel is gone, because there is nothing left to ask about.
    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("cancel-guests")).toHaveCount(0);
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("past the cutoff the panel warns instead of promising, and refunds nothing", async ({
  page,
  context,
}) => {
  // Seven hours out: inside the cancel window, outside the refund window.
  const game = await createScratchGame({ capacity: 12, priceCzk: 150, hoursFromNow: 7 });
  const admin = serviceClient();
  try {
    const bookingId = await bookWithGuests(game.id, 2, "runner");
    await setWalletTo(players.runner.id, 0);
    await asRunner(context);

    await page.goto(`/game/${game.id}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("cancel-guests-forfeit")).toBeVisible();
    await expect(page.getByTestId("cancel-guests-refund")).toHaveCount(0);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("cancel-guests-pick-1").click();
    await page.getByTestId("cancel-guests-submit").click();
    await page.waitForURL(/\?removed=1/);

    const { data: row } = await admin
      .from("bookings")
      .select("guest_count, price_czk")
      .eq("id", bookingId)
      .single();
    const booking = row as { guest_count: number; price_czk: number };

    expect(booking.guest_count, "the seat was not freed").toBe(1);
    expect(
      booking.price_czk,
      "a late removal reduced the price — the record of what was paid is gone",
    ).toBe(450);
    expect(await walletBalance(players.runner.id)).toBe(0);
  } finally {
    await destroyScratchGame(game.id);
  }
});
