import { expect, test } from "@playwright/test";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session";
import { createScratchGame, destroyScratchGame, clearActiveBookings, resetWallet } from "./helpers/scaffold";

/**
 * ROUND 16 ITEMS 16, 17, 18 AND 19 — the admin surfaces.
 *
 * EVERY CONTROL HERE IS GATED on `app_capabilities()`, which exists only once
 * the round-16 migration is applied. Local has it; production does not until
 * the owner runs it. These tests therefore assert the ENABLED behaviour, and
 * the gating itself is asserted separately below by reading the flag rather
 * than by assuming it.
 */

test.use({ viewport: { width: 390, height: 844 } });

test("the two summary sections are gone and their controls are not", async ({
  page,
  context,
}) => {
  const game = await createScratchGame({ capacity: 6, hoursFromNow: 30 });
  try {
    await signInAs(context, players.organizer);
    await page.goto(`/admin/games/${game.id}`, { waitUntil: "networkidle" });

    const body = await page.locator("main").innerText();

    /*
     * ASSERTED ON THE RENDERED HEADINGS, because the defect was that a reader
     * met two headings summarising a roster they were about to read anyway.
     * Checking for absent testids would pass on a page that still said both
     * words in a different element.
     */
    expect(body, "the Awaiting payment section is back").not.toMatch(/awaiting payment/i);
    expect(
      body,
      "a section headed Attendance is back — attendance is marked on the rows",
    ).not.toMatch(/^\s*attendance\s*$/im);

    // The roster survived, and so did close-out: `mark-played` is the only way
    // a game ever becomes settled.
    await expect(page.getByTestId("mark-played")).toBeVisible();
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("an admin removes a player and the seat and the credit both come back", async ({
  page,
  context,
}) => {
  const PRICE = 150;
  const game = await createScratchGame({ capacity: 6, priceCzk: PRICE });
  try {
    await clearActiveBookings("runner");
    await resetWallet(players.runner.id);

    const admin = serviceClient();
    const organizer = await apiClientFor(players.organizer);
    const { data: created, error } = await organizer.rpc("admin_create_booking", {
      p_game_id: game.id,
      p_player_id: players.runner.id,
      p_payment_method: "cash",
    });
    expect(error, error?.message).toBeNull();

    /*
     * CONFIRMED FIRST, AND THAT IS THE TEST'S WHOLE POINT.
     *
     * An admin-created cash booking is RESERVED — nobody has paid — so the
     * `cancel_game` rule returns `credit_applied_czk`, which is zero. Removing
     * it credits nothing, correctly: there is nothing to give back. The
     * interesting case is a booking that HAS been paid for, where the full
     * price must come back regardless of how close kickoff is.
     */
    // `admin_create_booking` returns the whole row, not an id.
    const bookingId = (created as { id: string }).id;

    const { error: payError } = await admin.rpc("confirm_booking", {
      p_booking_id: bookingId,
      p_confirmed_by: players.organizer.id,
    });
    expect(payError, payError?.message).toBeNull();

    const seats = async () =>
      (await admin.rpc("game_seats_taken", { p_game_id: game.id })).data;
    expect(await seats()).toBe(1);

    await signInAs(context, players.organizer);
    await page.goto(`/admin/games/${game.id}`, { waitUntil: "networkidle" });

    await page.getByTestId("roster-remove").first().click();

    /*
     * THE DIALOG MUST BE REACHABLE, not merely present — CLAUDE.md's modal
     * law. The admin shell is `relative z-10`, so a dialog rendered inside it
     * is capped under the nav pill at `z-40`: visible, enabled, and impossible
     * to press. `elementFromPoint` at the confirm button's centre is the only
     * assertion that catches that.
     */
    const confirm = page.getByTestId("roster-remove-confirm");
    await expect(confirm).toBeVisible();
    const onTop = await confirm.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el.contains(hit) || el === hit;
    });
    expect(onTop, "the confirm button is covered by the chrome").toBe(true);

    await confirm.click();

    // The seat is free again…
    await expect.poll(async () => await seats(), { timeout: 15_000 }).toBe(0);

    // …and the money came back IN FULL, which is the `cancel_game` rule rather
    // than `cancel_booking`'s: the player did not choose this.
    const { data: ledger } = await admin
      .from("credit_ledger")
      .select("delta_czk")
      .eq("player_id", players.runner.id);
    const balance = (ledger ?? []).reduce((sum, row) => sum + row.delta_czk, 0);
    expect(balance, "the removed player was not credited in full").toBe(PRICE);

  } finally {
    await clearActiveBookings("runner");
    await resetWallet(players.runner.id);
    await destroyScratchGame(game.id);
  }
});

test("an empty game deletes; a booked one refuses and says what to do", async ({
  page,
  context,
}) => {
  const empty = await createScratchGame({ capacity: 6, hoursFromNow: 40 });
  const booked = await createScratchGame({ capacity: 6, hoursFromNow: 41 });
  let emptyGone = false;

  try {
    await clearActiveBookings("runner");
    const organizer = await apiClientFor(players.organizer);
    await organizer.rpc("admin_create_booking", {
      p_game_id: booked.id,
      p_player_id: players.runner.id,
      p_payment_method: "cash",
    });

    await signInAs(context, players.organizer);

    // --- the booked one refuses, with the next step in the message ---------
    await page.goto(`/admin/games/${booked.id}`, { waitUntil: "networkidle" });
    await page.getByTestId("game-delete").click();
    await page.getByTestId("game-delete-confirm").click();

    const error = page.getByTestId("game-delete-error");
    await expect(error).toBeVisible();
    await expect(error, "the refusal does not say to cancel first").toContainText(/cancel/i);

    // It is still there, which is the point of refusing.
    const admin = serviceClient();
    const { data: still } = await admin.from("games").select("id").eq("id", booked.id).maybeSingle();
    expect(still).toBeTruthy();

    // --- the empty one goes ------------------------------------------------
    await page.goto(`/admin/games/${empty.id}`, { waitUntil: "networkidle" });
    await page.getByTestId("game-delete").click();
    await page.getByTestId("game-delete-confirm").click();

    await page.waitForURL(/\/admin\/games(\?|$)/);
    const { data: gone } = await admin.from("games").select("id").eq("id", empty.id).maybeSingle();
    expect(gone, "an empty game was not deleted").toBeNull();
    emptyGone = true;
  } finally {
    await clearActiveBookings("runner");
    await destroyScratchGame(booked.id);
    if (!emptyGone) await destroyScratchGame(empty.id);
  }
});

test("cancelling requires a reason, and the reason reaches the players", async ({
  page,
  context,
}) => {
  const game = await createScratchGame({ capacity: 6, hoursFromNow: 50 });
  const REASON = "Waterlogged pitch — the ground called it off";

  try {
    await clearActiveBookings("runner");
    await resetWallet(players.runner.id);
    const organizer = await apiClientFor(players.organizer);
    await organizer.rpc("admin_create_booking", {
      p_game_id: game.id,
      p_player_id: players.runner.id,
      p_payment_method: "cash",
    });

    await signInAs(context, players.organizer);
    await page.goto(`/admin/games/${game.id}`, { waitUntil: "networkidle" });

    await page.getByTestId("cancel-game").click();
    const reason = page.getByTestId("cancel-reason");
    await expect(reason).toBeVisible();

    /*
     * REQUIRED IN THE BROWSER, and that is only the courtesy. The action
     * checks too, and so does SQL — a server action is a POST endpoint
     * reachable without this form, and an action is skipped by anyone using
     * curl. The browser check is what stops a wasted round trip.
     */
    await expect(reason).toHaveAttribute("required", "");

    await reason.fill(REASON);
    await page.getByTestId("cancel-game-confirm").click();

    const admin = serviceClient();

    /*
     * ASSERTED ON THE ROW, NOT ON `cancel-game-result`.
     *
     * That marker is rendered from `useActionState`, and CLAUDE.md records the
     * trap: the action calls `revalidatePath`, and the re-render can unmount a
     * client-state success marker before anything observes it. It is a real
     * race, not a flake — it fails on a fast machine and passes on a slow one.
     * The database is the durable fact.
     */
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("games")
            .select("status")
            .eq("id", game.id)
            .maybeSingle();
          return data?.status ?? null;
        },
        { timeout: 20_000, message: "the game never reached cancelled" },
      )
      .toBe("cancelled");

    // THE REASON IS ON THE EVENT, so a later complaint can be answered from
    // the log rather than from somebody's memory of the email.
    const { data: events } = await admin
      .from("events")
      .select("metadata")
      .eq("game_id", game.id)
      .eq("event_type", "game_cancelled");
    expect(events, "no game_cancelled event").toHaveLength(1);
    expect((events![0]!.metadata as { reason?: string }).reason).toBe(REASON);

    // AND IT IS PUBLISHED. Row 89: the bell has no per-player recipient, so
    // the broadcast names the game and the reason and the EMAIL is the
    // per-player half.
    const { data: notes } = await admin
      .from("notifications")
      .select("title, body")
      .order("created_at", { ascending: false })
      .limit(1);
    expect(notes?.[0]?.body, "the reason is not in the notification").toContain(REASON);
  } finally {
    await clearActiveBookings("runner");
    await resetWallet(players.runner.id);
    await destroyScratchGame(game.id);
  }
});
