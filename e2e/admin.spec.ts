import { expect, test } from "@playwright/test";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session.ts";
import { moveKickoff } from "./helpers/clock.ts";
import {
  createScratchGame,
  destroyScratchGame,
  type ScratchGame,
} from "./helpers/scaffold.ts";

/**
 * Criterion 3 — payment confirmation in ≤5 seconds, with the roster telling
 *               paid / reserved / cash / seed apart.
 * Criterion 4 — a shadow player created and booked in one action, ≤10 seconds.
 * Criterion 8 — attendance drives the game to `settled` with no `reserved`
 *               booking left alive.
 * Criterion 13 — the WhatsApp preview card and the `.ics` file.
 * M4 gate    — the whole lifecycle inside 5 minutes of admin time.
 *
 * The timings are the criteria, so they are measured rather than assumed: this
 * is a product whose competitor is a WhatsApp thread, and an admin panel that
 * is slower than typing a message into a group chat will not get used.
 */

let game: ScratchGame;

test.beforeEach(async () => {
  game = await createScratchGame();
});

test.afterEach(async () => {
  await destroyScratchGame(game.id);
});

test("payment confirmation completes in under 5 seconds", async ({ page, context }) => {
  const runner = await apiClientFor(players.runner);
  const { data: booking } = await runner.rpc("create_booking", {
    p_game_id: game.id,
    p_payment_method: "qr",
  });
  expect(booking.status).toBe("reserved");

  await signInAs(context, players.organizer);
  await page.goto(`/admin/games/${game.id}`);

  const row = page
    .getByTestId("pending-booking")
    .filter({ hasText: players.runner.nickname });
  await expect(row).toBeVisible();

  const started = Date.now();
  await row.getByTestId("mark-paid").click();

  // The signal an organizer actually watches for: the booking leaves the
  // "awaiting payment" list. `confirm-result` is rendered by the row's own
  // client state, and `revalidatePath` unmounts that row before it can be
  // read — asserting on it would be asserting on a race.
  await expect(row).toHaveCount(0, { timeout: 5_000 });
  expect((Date.now() - started) / 1000).toBeLessThan(5);

  const admin = serviceClient();
  const { data: confirmed } = await admin
    .from("bookings")
    .select("status")
    .eq("id", booking.id)
    .single();
  expect(confirmed?.status).toBe("confirmed");
});

test("the roster tells paid, holding, cash and free apart", async ({ page, context }) => {
  // One of each, so a badge that renders the same word for two different
  // states cannot pass. This is what an organizer reads down the side of a
  // pitch to know who still owes money.
  const runner = await apiClientFor(players.runner);
  const seedBot = await apiClientFor(players.seedBot);
  const organizer = await apiClientFor(players.organizer);

  const { data: paid } = await runner.rpc("create_booking", {
    p_game_id: game.id,
    p_payment_method: "qr",
  });
  await organizer.rpc("create_booking", { p_game_id: game.id, p_payment_method: "cash" });
  await seedBot.rpc("create_booking", { p_game_id: game.id, p_payment_method: "qr" });

  const admin = serviceClient();
  await admin.rpc("confirm_booking", {
    p_booking_id: paid.id,
    p_confirmed_by: players.organizer.id,
  });

  const { data: holding } = await apiClientFor(players.creditPartial).then((c) =>
    c.rpc("create_booking", { p_game_id: game.id, p_payment_method: "qr" }),
  );
  expect(holding.status).toBe("reserved");

  await signInAs(context, players.organizer);
  await page.goto(`/admin/games/${game.id}`);

  const badges = page.getByTestId("admin-roster-row");
  await expect(badges.filter({ hasText: players.runner.nickname })).toContainText(/paid/i);
  await expect(badges.filter({ hasText: players.organizer.nickname })).toContainText(/cash/i);
  await expect(badges.filter({ hasText: players.seedBot.nickname })).toContainText(/free/i);
  await expect(badges.filter({ hasText: players.creditPartial.nickname })).toContainText(
    /holding/i,
  );
});

test("a shadow player is created and booked in one action, in under 10 seconds", async ({
  page,
  context,
}) => {
  await signInAs(context, players.organizer);
  await page.goto(`/admin/games/${game.id}/add-player`);

  // A nickname nobody else holds, and unique per run so a re-run does not trip
  // the duplicate guard it is not testing.
  const nickname = `WA_${Date.now().toString().slice(-8)}`;

  const started = Date.now();
  await page.getByTestId("add-player-nickname").fill(nickname);
  await page.getByTestId("add-player-submit").click();
  await expect(page.getByTestId("add-player-done")).toBeVisible();
  expect((Date.now() - started) / 1000).toBeLessThan(10);

  // One action, two rows: the identity and the booking. A shadow with no
  // booking would be an admin remembering to do a second thing.
  const admin = serviceClient();
  const { data: player } = await admin
    .from("players")
    .select("id,auth_user_id")
    .eq("nickname", nickname)
    .single();
  expect(player?.auth_user_id).toBeNull();

  const { data: booking } = await admin
    .from("bookings")
    .select("status")
    .eq("game_id", game.id)
    .eq("player_id", player!.id)
    .single();
  expect(booking).not.toBeNull();

  // The scratch game teardown removes the booking; the player is a real row
  // that outlives it, so it goes here.
  await admin.from("events").delete().eq("player_id", player!.id);
  await admin.from("bookings").delete().eq("player_id", player!.id);
  await admin.from("players").delete().eq("id", player!.id);
});

test("attendance drives the game to settled with no reserved booking left", async ({
  page,
  context,
}) => {
  const admin = serviceClient();

  // Two players: one turns up and has paid, one does not turn up and has not.
  const present = await apiClientFor(players.runner);
  const noShow = await apiClientFor(players.creditPartial);

  const { data: paidBooking } = await present.rpc("create_booking", {
    p_game_id: game.id,
    p_payment_method: "qr",
  });
  const { data: unpaidBooking } = await noShow.rpc("create_booking", {
    p_game_id: game.id,
    p_payment_method: "cash",
  });

  await admin.rpc("confirm_booking", {
    p_booking_id: paidBooking.id,
    p_confirmed_by: players.organizer.id,
  });

  // Kick-off has to be in the past before a game can be marked played.
  await moveKickoff(game.id, -2);

  await signInAs(context, players.organizer);
  await page.goto(`/admin/games/${game.id}/attendance`);

  await page.getByTestId("mark-played").click();

  const rows = page.getByTestId("attendance-row");
  await rows
    .filter({ hasText: players.runner.nickname })
    .getByTestId("mark-present")
    .click();
  await rows
    .filter({ hasText: players.creditPartial.nickname })
    .getByTestId("mark-no-show")
    .click();

  // THE HARD BLOCK. An unpaid hold surviving into `settled` is a debt with no
  // surface left to raise it, so settle refuses while one exists — and says
  // whose it is.
  await expect(page.getByTestId("settle-outstanding")).toContainText(
    players.creditPartial.nickname,
  );

  // Resolve it the way the blocked message itself instructs: take the payment
  // on the game page. Cancelling is the other route and is NOT available here
  // — `cancel_booking` refuses once kick-off has passed, which is the correct
  // behaviour and the reason the hint names payment first.
  await page.goto(`/admin/games/${game.id}`);
  const outstanding = page
    .getByTestId("pending-booking")
    .filter({ hasText: players.creditPartial.nickname });
  await outstanding.getByTestId("mark-paid").click();

  // Wait for the confirmation to land before navigating. `click()` returns as
  // soon as the form is submitted, and navigating away cancels the in-flight
  // server action — which is exactly how this spec first failed: the payment
  // never registered and settle was still correctly blocked.
  await expect(outstanding).toHaveCount(0);

  await page.goto(`/admin/games/${game.id}/attendance`);
  await page.getByTestId("settle-game").click();

  // `settle-done` is the button's own client state and it does not survive the
  // revalidation: once the game is settled the server stops rendering the
  // settle control at all. So the assertion is on what the page SAYS, backed
  // by what the database holds.
  await expect(page.locator("main")).toContainText(/settled/i);

  const { data: settled } = await admin
    .from("games")
    .select("status")
    .eq("id", game.id)
    .single();
  expect(settled?.status).toBe("settled");

  const { data: survivors } = await admin
    .from("bookings")
    .select("id")
    .eq("game_id", game.id)
    .eq("status", "reserved");
  expect(survivors ?? []).toHaveLength(0);
});

test("a shared game link renders a preview card and a working .ics", async ({
  page,
  request,
  context,
}) => {
  // --- the preview card ----------------------------------------------------
  // What WhatsApp reads. It fetches the page as an anonymous visitor with no
  // cookie, so the tags have to be there without a session.
  await page.goto(`/game/${game.id}`);

  const ogTitle = page.locator('meta[property="og:title"]');
  const ogImage = page.locator('meta[property="og:image"]');
  await expect(ogTitle).toHaveAttribute("content", /.+/);
  // Absolute, or the unfurler cannot fetch it — a relative path renders
  // locally and silently shows nothing in someone else's chat window.
  await expect(ogImage).toHaveAttribute("content", /^https?:\/\//);

  const imageUrl = await ogImage.getAttribute("content");
  const image = await request.get(imageUrl!);
  expect(image.ok()).toBeTruthy();
  expect(image.headers()["content-type"]).toContain("image/png");

  // --- the calendar file ---------------------------------------------------
  const runner = await apiClientFor(players.runner);
  await runner.rpc("create_booking", { p_game_id: game.id, p_payment_method: "qr" });

  await signInAs(context, players.runner);
  const ics = await request.get(`/game/${game.id}/ics`);
  expect(ics.ok()).toBeTruthy();
  expect(ics.headers()["content-type"]).toContain("text/calendar");

  const body = await ics.text();
  // The structural minimum a phone calendar needs to accept the file at all.
  expect(body).toContain("BEGIN:VCALENDAR");
  expect(body).toContain("BEGIN:VEVENT");
  expect(body).toMatch(/DTSTART:\d{8}T\d{6}Z/);
  expect(body).toContain("END:VCALENDAR");
});

test("the whole admin lifecycle fits inside five minutes", async ({ page, context }) => {
  // The M4 gate criterion, measured end to end rather than per step: create,
  // fill, confirm, attendance, settle. The steps are individually fast; what
  // this catches is a flow that has quietly grown an extra page.
  await signInAs(context, players.organizer);

  const started = Date.now();

  // --- create --------------------------------------------------------------
  await page.goto("/admin/games/new");
  await page.getByTestId("venue-select").selectOption({ label: "E2E Scratch Pitch" });
  await page
    .getByTestId("starts-at")
    .fill(new Date(Date.now() + 48 * 3600_000).toISOString().slice(0, 16));
  await page.locator('input[name="capacity"]').fill("6");
  await page.locator('input[name="priceCzk"]').fill("200");
  await page.getByTestId("game-form-submit").click();

  // Creating redirects straight to the new game's page — `game-form-saved` is
  // the EDIT form's confirmation and never appears here. The redirect is also
  // where the id comes from, which beats guessing at "the most recent game".
  await page.waitForURL(/\/admin\/games\/[0-9a-f-]{36}$/);
  const lifecycleGame = page.url().split("/").pop()!;

  const admin = serviceClient();

  try {
    await admin.rpc("publish_game", { p_game_id: lifecycleGame });

    // --- fill --------------------------------------------------------------
    const runner = await apiClientFor(players.runner);
    const { data: booking } = await runner.rpc("create_booking", {
      p_game_id: lifecycleGame,
      p_payment_method: "qr",
    });

    // --- confirm -----------------------------------------------------------
    await page.goto(`/admin/games/${lifecycleGame}`);
    const pending = page
      .getByTestId("pending-booking")
      .filter({ hasText: players.runner.nickname });
    await pending.getByTestId("mark-paid").click();
    await expect(pending).toHaveCount(0);

    // --- attendance + settle ----------------------------------------------
    await moveKickoff(lifecycleGame, -2);
    await page.goto(`/admin/games/${lifecycleGame}/attendance`);
    await page.getByTestId("mark-played").click();
    await page
      .getByTestId("attendance-row")
      .filter({ hasText: players.runner.nickname })
      .getByTestId("mark-present")
      .click();
    await page.getByTestId("settle-game").click();
    await expect(page.locator("main")).toContainText(/settled/i);

    const elapsedMinutes = (Date.now() - started) / 60_000;
    expect(elapsedMinutes).toBeLessThan(5);

    const { data: settled } = await admin
      .from("games")
      .select("status")
      .eq("id", lifecycleGame)
      .single();
    expect(settled?.status).toBe("settled");
    expect(booking.id).toBeTruthy();
  } finally {
    await destroyScratchGame(lifecycleGame);
  }
});
