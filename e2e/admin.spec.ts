import { expect, test } from "@playwright/test";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session.ts";
import { moveKickoff } from "./helpers/clock.ts";
import { strings } from "../lib/strings.ts";
import {
  createScratchGame,
  destroyScratchGame,
  setWalletTo,
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

  /*
   * Zero the wallets this file books with, BEFORE any booking is made.
   *
   * These specs are about payment state — reserved vs confirmed, the paid /
   * holding / cash / free badges — and a player with wallet credit does not
   * produce a `reserved` booking at all: `create_booking` applies the credit
   * and confirms instantly, which is correct behaviour and the wrong starting
   * position for an assertion about confirming a payment by hand.
   *
   * A fresh seed gives RealRunner a 200 CZK balance, which is exactly the price
   * of a scratch game. Every other spec file already normalises the wallet it
   * depends on; this one did not, so it passed only when an earlier run had
   * happened to leave the balance at zero — and failed on a freshly seeded
   * database, which is the one state that should be most reliable. That is the
   * failure mode CLAUDE.md warns about: a suite whose result depends on how
   * often it has been run.
   */
  await setWalletTo(players.runner.id, 0);
  await setWalletTo(players.creditPartial.id, 0);
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

  // `attendance-row` since Phase 18: the roster row and the attendance row are
  // the same row now (REQ-ADMIN-003). The two questions at close-out — did they
  // turn up, did they pay — are answered on one line rather than one screen
  // apart.
  const badges = page.getByTestId("attendance-row");
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
  await noShow.rpc("create_booking", {
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

  /*
   * ASSERTED ON THE STATUS CHIP, which the SERVER renders from `game.status`.
   *
   * This used to be `expect(page.locator("main")).toContainText(/settled/i)`,
   * and on the merged surface that became a FALSE GREEN: the payments section
   * renders "Nothing outstanding — every spot on this game is settled up.",
   * which matches the pattern whatever the game's status is. A loose text
   * match over a whole page is a match against every string on it, and the
   * merge tripled how many strings that is.
   *
   * `settle-done` is not the assertion either — it is the button's own client
   * state, and CLAUDE.md records that those do not survive `revalidatePath`.
   */
  await expect(page.getByTestId("admin-game-status")).toHaveText(strings.admin.status.settled);

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
    /*
     * CREATING PUBLISHES (round 7, item 6). This step used to be
     * `admin.rpc("publish_game", ...)` — a second call the flow no longer
     * needs, and one that would have gone on passing whether or not the
     * change worked, because its error was never checked.
     *
     * Asserted on the DATABASE rather than on the page: the status column is
     * what decides public visibility, and a badge can be right while the
     * column is wrong.
     */
    const { data: created } = await admin
      .from("games")
      .select("status")
      .eq("id", lifecycleGame)
      .single();
    expect(created?.status, "creating a game did not publish it").toBe("published");

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
    await expect(page.getByTestId("admin-game-status")).toHaveText(
      strings.admin.status.settled,
    );

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

/*
 * TEST-226 — the player detail page, and no-show marking from it.
 *
 * REQ-ADMIN-001 and REQ-ADMIN-002. The second half is the one worth being
 * careful about: §7 asks for the control in two places, and what makes that
 * safe is that both are surfaces onto ONE write. This asserts the write lands
 * and emits its event, not merely that a button existed.
 */
test("the player detail page shows history and marks a no-show", async ({
  page,
  context,
}) => {
  const scratch = await createScratchGame({ capacity: 4, hoursFromNow: 24 * 3 });

  try {
    const runner = await apiClientFor(players.runner);
    const { data: booking } = await runner.rpc("create_booking", {
      p_game_id: scratch.id,
      p_payment_method: "cash",
    });

    // Attendance is only markable once the game has kicked off — the RPC says
    // so and the row mirrors it.
    await moveKickoff(scratch.id, -2);

    await signInAs(context, players.organizer);
    await page.goto(`/admin/players/${players.runner.id}`);

    // REQ-ADMIN-001 — everything the contract lists.
    await expect(page.getByTestId("admin-player-email")).toContainText(
      players.runner.email!,
    );
    await expect(page.getByTestId("admin-player-balance")).toBeVisible();
    await expect(page.getByTestId("admin-player-games-played")).toBeVisible();
    await expect(page.getByTestId("admin-player-no-shows")).toBeVisible();
    // No photo on this seeded player, so initials — the ordinary case.
    await expect(page.getByTestId("admin-player-avatar")).toBeVisible();
    await expect(page.getByTestId("admin-player-photo")).toHaveCount(0);

    const before = Number(
      (await page.getByTestId("admin-player-no-shows").textContent()) ?? "0",
    );

    // REQ-ADMIN-002 — mark it here rather than on the game.
    const row = page
      .locator('[data-testid="player-game-row"]')
      .filter({ hasText: "E2E Scratch Pitch" })
      .first();
    await row.getByTestId("player-mark-no-show").click();

    // Wait for what the SERVER renders next, not for the action's own state.
    await expect(page.getByTestId("admin-player-no-shows")).toHaveText(String(before + 1));

    const admin = serviceClient();
    const { data: updated } = await admin
      .from("bookings")
      .select("attendance")
      .eq("id", booking.id)
      .single();
    expect(updated?.attendance).toBe("no_show");

    // The same RPC the game roster calls, so the same event.
    const { data: events } = await admin
      .from("events")
      .select("event_type")
      .eq("booking_id", booking.id)
      .eq("event_type", "attendance_marked");
    expect((events ?? []).length).toBeGreaterThan(0);
  } finally {
    await destroyScratchGame(scratch.id);
  }
});

/*
 * REQ-ADMIN-003 — one surface. The merged page carries every function that
 * used to be spread across three routes, and the old URLs still resolve.
 */
test("the game surface carries edit, roster, paid, attendance and cancel", async ({
  page,
  context,
}) => {
  const scratch = await createScratchGame({ capacity: 4, hoursFromNow: 24 * 4 });

  try {
    await signInAs(context, players.organizer);
    await page.goto(`/admin/games/${scratch.id}`);

    // Edit — the form itself, not a link to it.
    await expect(page.getByTestId("game-form-submit")).toBeVisible();
    await expect(page.getByTestId("organizer-name")).toBeVisible();
    // Add player, and cancel.
    await expect(page.getByTestId("add-player")).toBeVisible();
    await expect(page.getByTestId("cancel-game")).toBeVisible();

    // The old routes still land somewhere correct rather than 404ing.
    await page.goto(`/admin/games/${scratch.id}/edit`);
    await page.waitForURL(`**/admin/games/${scratch.id}`);
    await expect(page.getByTestId("game-form-submit")).toBeVisible();

    await page.goto(`/admin/games/${scratch.id}/attendance`);
    await page.waitForURL(`**/admin/games/${scratch.id}`);
  } finally {
    await destroyScratchGame(scratch.id);
  }
});

/*
 * TEST-227 — the stats page against a hand-computed window.
 *
 * BUILT FROM SCRATCH RATHER THAN ASSERTED OVER THE SEED. The seed tableau is
 * shared and the other specs mutate it, so a "known week" that included seeded
 * games would be a number that depended on what had run before it. Instead
 * this creates its own games inside TODAY's window, computes what each metric
 * must be by hand, and reads the page.
 *
 * The `day` window is used deliberately: it is the narrowest, so the fixtures
 * this spec creates are the only things in it apart from whatever else the run
 * has done today — which is why every assertion below is a DELTA against a
 * baseline read first, not an absolute.
 */
test("the stats page reports a hand-computed window", async ({ page, context }) => {
  await signInAs(context, players.organizer);

  /*
   * THE MONTH WINDOW, and the expectation is DERIVED from the range the page
   * itself reports rather than assumed.
   *
   * The first version used `day` with two games an hour or two out. That is
   * fine at three in the afternoon and wrong at half past eleven at night: the
   * second game crosses Prague midnight into tomorrow, falls outside today's
   * window, and the capacity delta comes back 4 instead of 8. A spec that
   * passes depending on the hour it runs is the flake CLAUDE.md warns about —
   * re-running "fixes" nothing and the failure is never reproducible.
   *
   * So: the widest window, and the fixtures are checked against its printed
   * bounds. The assertion stays hand-computed — it is still "these games, that
   * many spots" — it just no longer assumes which side of a boundary they fell.
   */
  await page.goto("/admin/stats?window=month");
  const baseline = await readStats(page);

  /*
   * BEYOND THE REFUND CUTOFF (policy v2, migration 40). These were 1 and 2
   * hours out, which is now INSIDE the ten-hour window — the cancellation
   * below still succeeds and still frees the spot, but issues no credit, so
   * `cancelledWithCredit` never moves and the assertion at the foot of this
   * test fails for a reason that has nothing to do with the stats page.
   *
   * 24 and 25 hours keeps them comfortably inside the month window this test
   * deliberately uses, so the midnight-boundary reasoning above is untouched.
   */
  const first = await createScratchGame({ capacity: 4, hoursFromNow: 24 });
  const second = await createScratchGame({ capacity: 4, hoursFromNow: 25 });

  try {
    const runner = await apiClientFor(players.runner);
    const rich = await apiClientFor(players.creditRich);

    // Three active bookings across the two games.
    const { data: a } = await runner.rpc("create_booking", {
      p_game_id: first.id,
      p_payment_method: "cash",
    });
    await rich.rpc("create_booking", { p_game_id: first.id, p_payment_method: "cash" });
    const { data: c } = await runner.rpc("create_booking", {
      p_game_id: second.id,
      p_payment_method: "cash",
    });

    // One confirmed payment, so revenue is exactly one game's price.
    const admin = serviceClient();
    await admin.rpc("confirm_booking", {
      p_booking_id: a.id,
      p_confirmed_by: players.organizer.id,
    });

    // One cancellation, which issued credit because the booking was paid.
    await admin.rpc("confirm_booking", {
      p_booking_id: c.id,
      p_confirmed_by: players.organizer.id,
    });
    const { error: cancelError } = await runner.rpc("cancel_booking", {
      p_booking_id: c.id,
    });
    expect(cancelError).toBeNull();

    // The bounds the page is reporting, read before the assertions so the
    // expectation and the figures describe the same period.
    const range = await readRange(page);

    await page.goto("/admin/stats?window=month");
    const after = await readStats(page);

    // Which of the fixtures the window actually holds. Almost always both.
    const inWindow = [first, second].filter((game) =>
      withinRange(game.startsAt, range),
    );
    expect(inWindow.length).toBeGreaterThanOrEqual(1);

    // Capacity: four spots per game that landed in the window.
    expect(after.capacity - baseline.capacity).toBe(inWindow.length * 4);
    // Sold: three created, one cancelled — two still active.
    expect(after.sold - baseline.sold).toBe(2);
    // Revenue: two payments confirmed at 200, and cancelling does NOT retract
    // the payment_confirmed event — the money did arrive.
    expect(after.revenue - baseline.revenue).toBe(2 * first.priceCzk);
    // Cancellations: one, and it issued credit.
    expect(after.cancellations - baseline.cancellations).toBe(1);
    expect(after.cancelledWithCredit - baseline.cancelledWithCredit).toBe(1);
  } finally {
    await destroyScratchGame(first.id);
    await destroyScratchGame(second.id);
  }
});

/** The printed window bounds, as instants. */
async function readRange(
  page: import("@playwright/test").Page,
): Promise<{ from: number; to: number }> {
  await page.goto("/admin/stats?window=month");
  const text = (await page.getByTestId("stat-range").textContent()) ?? "";
  // "1 Aug 2026 — 31 Aug 2026". The upper bound printed is the last day INSIDE
  // the window, so the exclusive bound is the following midnight.
  const [from, to] = text.split("—").map((part) => Date.parse(part.trim()));
  return { from, to: to + 86_400_000 };
}

function withinRange(iso: string, range: { from: number; to: number }): boolean {
  const at = Date.parse(iso);
  return at >= range.from && at < range.to;
}

/** The five numbers off the stats page, as numbers. */
async function readStats(page: import("@playwright/test").Page) {
  // An empty window renders the empty state instead of the tiles, which is a
  // legitimate baseline — every figure is zero.
  if ((await page.getByTestId("stats-empty").count()) > 0) {
    return { capacity: 0, sold: 0, revenue: 0, cancellations: 0, cancelledWithCredit: 0 };
  }

  // Read from the card's own value/detail hooks rather than by scraping the
  // whole card: the headline runs straight into the sub-line otherwise, and
  // "1" followed by "1 with credit" reads as eleven.
  const detailOf = async (testId: string) =>
    (await page.getByTestId(testId).getByTestId("stat-detail").textContent()) ?? "";
  const valueOf = async (testId: string) =>
    (await page.getByTestId(testId).getByTestId("stat-value").textContent()) ?? "";

  // "12 of 20" — the detail line under the percentage.
  const fillMatch = (await detailOf("stat-fill-rate")).match(/(\d+)\s*of\s*(\d+)/);
  const revenue = await valueOf("stat-revenue");
  const cancels = await valueOf("stat-cancellations");
  const cancelDetail = await detailOf("stat-cancellations");

  return {
    sold: Number(fillMatch?.[1] ?? 0),
    capacity: Number(fillMatch?.[2] ?? 0),
    revenue: Number((revenue.match(/([\d,\s]+)\s*CZK/)?.[1] ?? "0").replace(/[,\s]/g, "")),
    cancellations: Number(cancels.match(/\d+/)?.[0] ?? 0),
    cancelledWithCredit: Number(cancelDetail.match(/(\d+)\s*with credit/)?.[1] ?? 0),
  };
}

/*
 * REQ-ADMIN-004 — the three removed metrics are gone from the page.
 */
test("the removed metrics do not render", async ({ page, context }) => {
  await signInAs(context, players.organizer);
  await page.goto("/admin/stats?window=month");

  await expect(page.getByTestId("stat-credit")).toHaveCount(0);
  await expect(page.getByTestId("stat-drop-off")).toHaveCount(0);
  await expect(page.getByTestId("stat-waitlist-row")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Magic-link");
  await expect(page.locator("body")).not.toContainText("Waitlist depth");
});

/*
 * REQ-ADMIN-006 — every metric is filterable, and the window is visible.
 */
test("the window picker switches the range", async ({ page, context }) => {
  await signInAs(context, players.organizer);

  await page.goto("/admin/stats");
  // Week is the default: a day is often empty and a month is too coarse to
  // notice anything changing.
  await expect(page.getByTestId("stat-window-week")).toHaveAttribute(
    "data-selected",
    "true",
  );

  const weekRange = await page.getByTestId("stat-range").textContent();

  await page.getByTestId("stat-window-month").click();
  await page.waitForURL(/window=month/);
  await expect(page.getByTestId("stat-window-month")).toHaveAttribute(
    "data-selected",
    "true",
  );
  await expect(page.getByTestId("stat-range")).not.toHaveText(weekRange ?? "");
});
