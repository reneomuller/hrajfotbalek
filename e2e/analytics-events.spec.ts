import { expect, test, type Page } from "@playwright/test";
import { execAsOwner } from "./helpers/clock";
import { signInThroughForm } from "./helpers/accounts";
import { clearActiveBookings, createScratchGame, destroyScratchGame, setWalletTo } from "./helpers/scaffold";
import { SEED_PASSWORD, apiClientFor, players, serviceClient, signInAs } from "./helpers/session";

/**
 * GA4 EVENTS IN THE DATALAYER (GTM v4, 2026-11-12). The owner asked for
 * `purchase`, `game_booked`, `login`, `waitlist_join`, `booking_cancelled`,
 * `share_game`, and `user_id` / `player_id` as the internal id, never the
 * email. Each is asserted to reach `window.dataLayer` exactly once.
 *
 * REGISTERED ONLY WHILE A CONTAINER IS CONFIGURED, like `analytics-signup`:
 * every flag and push is off without `NEXT_PUBLIC_GTM_ID`, and the ordinary
 * suite runs without one. Run it with a stand-in container:
 *
 *   NEXT_PUBLIC_GTM_ID=GTM-TEST000 npx playwright test e2e/analytics-events.spec.ts
 */
const gtmOn = /^GTM-[A-Z0-9]{4,}$/.test((process.env.NEXT_PUBLIC_GTM_ID ?? "").trim());

type Entry = Record<string, unknown> & { event?: string };

async function dataLayer(page: Page): Promise<Entry[]> {
  return page.evaluate(() => ((window as unknown as { dataLayer?: Entry[] }).dataLayer ?? []).filter(
    (entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry) && !("length" in entry),
  ));
}

async function events(page: Page, name: string): Promise<Entry[]> {
  return (await dataLayer(page)).filter((entry) => entry.event === name);
}

if (gtmOn) {
  test("the player id is in the dataLayer before the container starts, and the email never is", async ({
    page,
    context,
  }) => {
    // Arrange
    await signInAs(context, players.runner);

    // Act
    await page.goto("/games");
    await expect(page.getByTestId("game-list").or(page.getByTestId("empty-state-cta")).first()).toBeVisible();

    // Assert
    const layer = await dataLayer(page);
    const userAt = layer.findIndex((entry) => entry.user_id === players.runner.id);
    const gtmAt = layer.findIndex((entry) => entry.event === "gtm.js");
    expect(userAt, "user_id reached the dataLayer").toBeGreaterThanOrEqual(0);
    expect(layer[userAt]?.player_id).toBe(players.runner.id);
    if (gtmAt >= 0) expect(userAt, "before GTM's own start event").toBeLessThan(gtmAt);
    expect(JSON.stringify(layer)).not.toContain(players.runner.email!);
  });

  test("a password sign-in pushes one login, and the flag leaves the address bar", async ({ page }) => {
    // Act
    await signInThroughForm(page, { email: players.runner.email!, password: SEED_PASSWORD });

    // Assert
    await expect.poll(async () => (await events(page, "login")).length).toBe(1);
    expect((await events(page, "login"))[0]?.method).toBe("password");
    await expect(page).not.toHaveURL(/logged_in=/);
  });

  test("signing in through the emailed link pushes one login, method magic_link", async ({ page }) => {
    // Arrange — the link the email carries, minted by the local auth server.
    // The first draft of the events counted the password and the code, and
    // not this — the way most players sign in (2026-11-12).
    const { data, error } = await serviceClient().auth.admin.generateLink({
      type: "magiclink",
      email: players.runner.email!,
    });
    expect(error).toBeNull();

    // Act
    await page.goto(`/auth/callback?token_hash=${data.properties!.hashed_token}&type=magiclink`);

    // Assert
    await expect.poll(async () => (await events(page, "login")).length).toBe(1);
    expect((await events(page, "login"))[0]?.method).toBe("magic_link");
    await expect(page).not.toHaveURL(/logged_in=/);
  });

  test("a booking pushes one game_booked; a refresh and a forged ?paid= push nothing", async ({ page, context }) => {
    // Arrange — paid from Credits, the flow that finishes on this origin.
    const game = await createScratchGame({ durationMinutes: 90, hoursFromNow: 48 });
    try {
      await clearActiveBookings("runner");
      await setWalletTo(players.runner.id, 180);
      await signInAs(context, players.runner);

      // Act
      await page.goto(`/game/${game.id}/book`, { waitUntil: "networkidle" });
      await page.getByTestId("pay-credit-input").check();
      await page.getByTestId("terms-accept").check();
      await page.getByTestId("confirm-booking").click();
      await page.waitForURL(/\/book\/confirmation/);

      // Assert
      await expect.poll(async () => (await events(page, "game_booked")).length).toBe(1);
      const booked = (await events(page, "game_booked"))[0]!;
      expect(booked).toMatchObject({ game_id: game.id, payment_method: "credit" });
      await expect(page).not.toHaveURL(/booked=/);
      expect(await events(page, "purchase"), "Credits are not new revenue").toHaveLength(0);

      // A refresh is not a second booking.
      await page.reload();
      await expect(page.getByTestId("confirmation")).toBeVisible();
      expect(await events(page, "game_booked")).toHaveLength(0);

      // Nor is a hand-made ?paid= a sale (2026-11-12: verified against the
      // checkout before anything is reported).
      await page.goto(`${page.url()}${page.url().includes("?") ? "&" : "?"}paid=cs_test_forged`);
      await expect(page.getByTestId("confirmation")).toBeVisible();
      expect(await events(page, "purchase")).toHaveLength(0);
    } finally {
      await clearActiveBookings("runner");
      await destroyScratchGame(game.id);
    }
  });

  test("a card payment that really settled pushes one purchase, at what Stripe charged", async ({
    page,
    context,
  }) => {
    // Arrange — the rows `settle_checkout_session` leaves behind a paid card
    // booking, written directly: Stripe cannot be driven from here.
    const game = await createScratchGame({ durationMinutes: 90, hoursFromNow: 48 });
    const session = `cs_test_e2e_${Date.now()}`;
    try {
      await clearActiveBookings("runner");
      const { data: booking } = await serviceClient()
        .from("bookings")
        .select("id")
        .eq("game_id", game.id)
        .maybeSingle();
      expect(booking).toBeNull();
      await execAsOwner(
        `with b as (
           insert into public.bookings (game_id, player_id, status, payment_method, payment_code, price_czk, credit_applied_czk, stripe_session_id)
           values ($1, $2, 'confirmed', 'qr', null, 180, 0, $3) returning id)
         insert into public.checkout_sessions (stripe_session_id, game_id, player_id, amount_czk, status, booking_id, settled_at)
         select $3, $1, $2, 180, 'booked', b.id, now() from b`,
        [game.id, players.runner.id, session],
      );
      const { data: made } = await serviceClient()
        .from("bookings")
        .select("id")
        .eq("stripe_session_id", session)
        .single();
      await signInAs(context, players.runner);

      // Act — where the payment return page sends a paid player.
      await page.goto(`/game/${game.id}/book/confirmation?booking=${made!.id}&booked=1&paid=${session}`);

      // Assert
      await expect.poll(async () => (await events(page, "purchase")).length).toBe(1);
      const purchase = (await events(page, "purchase"))[0]!;
      expect(purchase.ecommerce).toMatchObject({ transaction_id: session, value: 180, currency: "CZK" });
      expect(await events(page, "game_booked")).toHaveLength(1);
    } finally {
      await execAsOwner("delete from public.checkout_sessions where stripe_session_id = $1", [session]);
      await clearActiveBookings("runner");
      await destroyScratchGame(game.id);
    }
  });

  test("a cancellation pushes one booking_cancelled, with the game and whether it was refunded", async ({
    page,
    context,
  }) => {
    // Arrange — a cash booking a week out, inside the refund window.
    const game = await createScratchGame({ durationMinutes: 90, hoursFromNow: 24 * 7 });
    try {
      await clearActiveBookings("runner");
      const runner = await apiClientFor(players.runner);
      const { error } = await runner.rpc("create_booking", { p_game_id: game.id, p_payment_method: "cash" });
      expect(error).toBeNull();
      await signInAs(context, players.runner);

      // Act
      await page.goto(`/game/${game.id}`);
      await page.getByTestId("cancel-booking").click();
      await page.getByTestId("cancel-dialog-confirm").click();

      // Assert
      await expect.poll(async () => (await events(page, "booking_cancelled")).length).toBe(1);
      expect((await events(page, "booking_cancelled"))[0]).toMatchObject({ game_id: game.id });
      await expect(page).not.toHaveURL(/cancelled=/);
    } finally {
      await clearActiveBookings("runner");
      await destroyScratchGame(game.id);
    }
  });

  test("joining a full game's waitlist pushes one waitlist_join", async ({ page, context }) => {
    // Arrange — two seats, both taken.
    const game = await createScratchGame({ capacity: 2, durationMinutes: 90, hoursFromNow: 48 });
    try {
      for (const player of [players.organizer, players.seedBot] as const) {
        const session = await apiClientFor(player);
        const { error } = await session.rpc("create_booking", { p_game_id: game.id, p_payment_method: "cash" });
        expect(error).toBeNull();
      }
      await signInAs(context, players.runner);

      // Act
      await page.goto(`/game/${game.id}`);
      await page.getByTestId("join-waitlist").click();
      await expect(page.getByTestId("claim-bar")).toHaveAttribute("data-state", "waitlisted");

      // Assert
      await expect.poll(async () => (await events(page, "waitlist_join")).length).toBe(1);
      expect((await events(page, "waitlist_join"))[0]).toMatchObject({ game_id: game.id });
    } finally {
      await execAsOwner("delete from public.waitlist where game_id = $1", [game.id]);
      await destroyScratchGame(game.id);
    }
  });

  test("sharing a game on WhatsApp pushes one share_game", async ({ page, context }) => {
    // Arrange — the WhatsApp button is the game page's one share control
    // (Copy link lives in `SharePair`, which nothing renders). WhatsApp itself
    // is never opened: the event is the site's, the page beyond is theirs.
    const game = await createScratchGame({ durationMinutes: 90, hoursFromNow: 48 });
    try {
      await context.route(/whatsapp\.com|wa\.me/, (route) => route.abort());

      // Act
      await page.goto(`/game/${game.id}`);
      await page.getByTestId("share-whatsapp").click();

      // Assert
      await expect.poll(async () => (await events(page, "share_game")).length).toBe(1);
      expect((await events(page, "share_game"))[0]?.platform).toBe("whatsapp");
    } finally {
      await destroyScratchGame(game.id);
    }
  });
}
