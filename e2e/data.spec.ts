import { expect, test } from "@playwright/test";
import { anonClient, apiClientFor, players, serviceClient } from "./helpers/session.ts";
import { expireDeadline, moveKickoff } from "./helpers/clock.ts";
import {
  createScratchGame,
  destroyScratchGame,
  setWalletTo,
} from "./helpers/scaffold.ts";

/**
 * Criterion 9  — every catalog action writes its event row.
 * Criterion 10 — RLS isolation, and the anonymous roster projection.
 * Criterion 12 — a cron double-run produces no duplicate emails or events.
 * Criterion 15 — cross-user and non-admin RPC calls are rejected INSIDE the
 *                function.
 *
 * These assert through the API and the database rather than through a page,
 * because none of them has a user-visible path — and that is exactly why they
 * need a test. A UI that never offers a button to book on someone else's
 * behalf proves nothing about what happens when someone calls the endpoint
 * with curl.
 */

const CRON_SECRET = process.env.CRON_SECRET!;

test("a logged-in player cannot read another player's rows", async () => {
  const runner = await apiClientFor(players.runner);

  // Own row: visible.
  const own = await runner.from("players").select("id,email").eq("id", players.runner.id);
  expect(own.data ?? []).toHaveLength(1);

  // Someone else's: not an error, an EMPTY RESULT. RLS filters rather than
  // refusing, which is the correct shape — a refusal would confirm the row
  // exists.
  const other = await runner
    .from("players")
    .select("id,email")
    .eq("id", players.creditRich.id);
  expect(other.data ?? []).toHaveLength(0);

  // Bookings, ledger and events are all own-row or no-row.
  const otherBookings = await runner
    .from("bookings")
    .select("id")
    .eq("player_id", players.creditRich.id);
  expect(otherBookings.data ?? []).toHaveLength(0);

  const otherLedger = await runner
    .from("credit_ledger")
    .select("id")
    .eq("player_id", players.creditRich.id);
  expect(otherLedger.data ?? []).toHaveLength(0);

  // The event log has no client access at all — not even to your own rows.
  const events = await runner.from("events").select("id").limit(1);
  expect(events.data ?? []).toHaveLength(0);
});

test("the anonymous roster exposes a nickname and a photo path, and nothing else", async () => {
  const game = await createScratchGame();

  try {
    const runner = await apiClientFor(players.runner);
    await runner.rpc("create_booking", { p_game_id: game.id, p_payment_method: "qr" });

    const anon = anonClient();
    const { data, error } = await anon
      .from("game_roster_public")
      .select("*")
      .eq("game_id", game.id);

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);

    // The whole projection, checked by its shape rather than by naming the
    // columns we hope are absent: a new column added to the view would
    // otherwise sail through this test.
    //
    // `photo_path` was added in Phase 15 (migration 29) and `games_played` in
    // migration 39, both under contract §4a and both ratified in advance. This
    // list moving is the mechanism working: neither widening could happen
    // without someone editing this line and the matching ones in
    // `supabase/tests/04_game_roster_public.sql` and `roster_photo_path.sql`
    // on purpose.
    //
    // `status` LEFT in migration 20260808150000, and this test is the one that
    // should have caught it years earlier — it did not, because it asserted
    // the shape the view HAD rather than the shape the view was supposed to
    // have, and `status` was in both. The mechanism catches a widening nobody
    // decided on; it cannot catch a column everyone had already decided to
    // remove and only removed from the render. `PlayersList.tsx` stopped
    // showing booking status; the wire kept sending it, and
    // `?select=nickname,status&status=eq.reserved` listed the players who had
    // not paid.
    for (const row of data ?? []) {
      const keys = Object.keys(row).sort();
      /*
       * WIDENED IN ROUND 11, and this line having to be edited is the guard
       * working rather than failing.
       *
       * The three new columns are facts about a SEAT, not about a person:
       * `is_guest` says draw a monogram, `guest_of` names the player who
       * brought this one — a nickname the holder's own row already publishes
       * for the same game — and `guest_index` numbers it. The property this
       * test exists for is unchanged and is still asserted exhaustively: no
       * player_id, no email, no phone, no booking status.
       */
      expect(keys).toEqual([
        "game_id",
        "games_played",
        "guest_index",
        "guest_of",
        "is_guest",
        "nickname",
        "photo_path",
      ]);
      // No email address rode along with it — the cheapest possible check for
      // the single worst thing this view could ever leak.
      expect(JSON.stringify(row)).not.toContain("@");
    }

    // The base table stays closed to anonymous readers regardless.
    const direct = await anon.from("bookings").select("id").eq("game_id", game.id);
    expect(direct.data ?? []).toHaveLength(0);
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("the public waitlist withholds the timestamps that produce its order", async () => {
  const game = await createScratchGame({ capacity: 1 });

  try {
    const filler = await apiClientFor(players.organizer);
    await filler.rpc("create_booking", { p_game_id: game.id, p_payment_method: "cash" });

    const waiter = await apiClientFor(players.runner);
    await waiter.rpc("join_waitlist", { p_game_id: game.id });

    const anon = anonClient();
    const { data } = await anon.from("game_waitlist_public").select("*").eq("game_id", game.id);

    expect((data ?? []).length).toBe(1);
    for (const row of data ?? []) {
      // A queue nobody can see is a queue nobody trusts — so the nickname and
      // the position are public. `player_id` and `joined_at` are not: the
      // order is readable without the data that produces it.
      const keys = Object.keys(row).sort();
      expect(keys).not.toContain("player_id");
      expect(keys).not.toContain("joined_at");
    }
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("cross-user booking and cancellation are refused inside the function", async () => {
  const game = await createScratchGame();

  try {
    const victim = await apiClientFor(players.creditRich);
    await setWalletTo(players.creditRich.id, 0);
    const { data: theirBooking } = await victim.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "qr",
    });

    const attacker = await apiClientFor(players.runner);

    // `create_booking` takes no player id at all — identity is `auth.uid()`,
    // and booking on someone else's behalf exists only as the separate
    // admin-only entry point. That design is the reason there is nothing to
    // forge here; what CAN be forged is a booking id.
    const cancel = await attacker.rpc("cancel_booking", {
      p_booking_id: theirBooking.id,
    });
    expect(cancel.error).not.toBeNull();

    // Refused, and the booking is untouched — not "refused" by returning
    // success and doing nothing.
    const admin = serviceClient();
    const { data: still } = await admin
      .from("bookings")
      .select("status")
      .eq("id", theirBooking.id)
      .single();
    expect(still?.status).toBe("reserved");
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("non-admin calls to the admin RPCs are refused inside the function", async () => {
  const game = await createScratchGame();

  try {
    const runner = await apiClientFor(players.runner);
    const { data: booking } = await runner.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "qr",
    });

    // Every one of these is a plain authenticated session. None of them is an
    // admin, and the panel's route guard is irrelevant here — these calls go
    // straight to the database.
    const attempts = await Promise.all([
      runner.rpc("confirm_booking", {
        p_booking_id: booking.id,
        p_confirmed_by: players.organizer.id,
      }),
      runner.rpc("expire_booking", { p_booking_id: booking.id }),
      runner.rpc("admin_create_booking", {
        p_game_id: game.id,
        p_player_id: players.shadowNoEmail.id,
        p_payment_method: "cash",
      }),
      runner.rpc("mark_attendance", { p_booking_id: booking.id, p_attendance: "present" }),
      runner.rpc("grant_credit", { p_player_id: players.runner.id, p_delta_czk: 10_000 }),
      runner.rpc("merge_players", {
        p_shadow_id: players.shadowNoEmail.id,
        p_surviving_id: players.runner.id,
      }),
      runner.rpc("set_player_admin", { p_player_id: players.runner.id, p_is_admin: true }),
    ]);

    for (const attempt of attempts) {
      expect(attempt.error).not.toBeNull();
      expect(attempt.error?.message).toMatch(/INSUFFICIENT_PERMISSION|permission denied/i);
    }

    // Nothing moved. A self-granted 10,000 CZK wallet or a self-granted admin
    // flag would be the two worst outcomes in this product.
    const admin = serviceClient();
    const { data: player } = await admin
      .from("players")
      .select("is_admin")
      .eq("id", players.runner.id)
      .single();
    expect(player?.is_admin).toBe(false);

    const { data: ledger } = await admin
      .from("credit_ledger")
      .select("delta_czk")
      .eq("player_id", players.runner.id)
      .eq("delta_czk", 10_000);
    expect(ledger ?? []).toHaveLength(0);
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("the service-role-only sweep RPCs refuse an ordinary session", async () => {
  const game = await createScratchGame();

  try {
    const runner = await apiClientFor(players.runner);
    const { data: booking } = await runner.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "qr",
    });

    const attempts = await Promise.all([
      runner.rpc("notify_waitlist", { p_game_id: game.id }),
      runner.rpc("mark_nudged", { p_booking_id: booking.id, p_grace_hours: 12 }),
      runner.rpc("mark_reminder_sent", { p_booking_id: booking.id }),
    ]);

    for (const attempt of attempts) {
      expect(attempt.error).not.toBeNull();
    }
  } finally {
    await destroyScratchGame(game.id);
  }
});

test("every action in the catalog writes its event row", async () => {
  const game = await createScratchGame({ capacity: 2 });
  const admin = serviceClient();

  try {
    const eventsFor = async () => {
      const { data } = await admin.from("events").select("event_type").eq("game_id", game.id);
      return new Set((data ?? []).map((row: { event_type: string }) => row.event_type));
    };

    // publish -> game_published (the game was published by the scaffold)
    expect(await eventsFor()).toContain("game_published");

    const runner = await apiClientFor(players.runner);
    const other = await apiClientFor(players.creditPartial);
    await setWalletTo(players.runner.id, 0);

    // book -> booking_created
    const { data: booking } = await runner.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "qr",
    });
    expect(await eventsFor()).toContain("booking_created");

    // admin books on behalf -> admin_booking_created
    const organizer = await apiClientFor(players.organizer);
    await organizer.rpc("admin_create_booking", {
      p_game_id: game.id,
      p_player_id: players.shadowNoEmail.id,
      p_payment_method: "cash",
    });
    expect(await eventsFor()).toContain("admin_booking_created");

    // waitlist join on the now-full game -> waitlist_joined
    await other.rpc("join_waitlist", { p_game_id: game.id });
    expect(await eventsFor()).toContain("waitlist_joined");

    // overpayment -> payment_confirmed AND credit_issued, in one transaction
    await admin.rpc("confirm_booking", {
      p_booking_id: booking.id,
      p_confirmed_by: players.organizer.id,
      p_received_amount_czk: game.priceCzk + 50,
    });
    const afterPayment = await eventsFor();
    expect(afterPayment).toContain("payment_confirmed");
    expect(afterPayment).toContain("credit_issued");

    // cancel -> booking_cancelled + spot_released, and the release notifies
    await runner.rpc("cancel_booking", { p_booking_id: booking.id });
    const afterCancel = await eventsFor();
    expect(afterCancel).toContain("booking_cancelled");
    expect(afterCancel).toContain("spot_released");

    await admin.rpc("notify_waitlist", { p_game_id: game.id });
    expect(await eventsFor()).toContain("waitlist_notified");

    // attendance -> attendance_marked; settle -> game_settled
    await moveKickoff(game.id, -2);
    await organizer.rpc("mark_game_played", { p_game_id: game.id });

    // Read the survivors AFTER the cancellation above, and take both statuses:
    // the shadow's cash booking is still `reserved`, and an earlier draft of
    // this spec asked only for `confirmed` — which selected nothing at all and
    // reported a working attendance path as missing its event.
    const { data: active } = await admin
      .from("bookings")
      .select("id,status")
      .eq("game_id", game.id)
      .in("status", ["reserved", "confirmed"]);

    for (const row of (active ?? []) as { id: string; status: string }[]) {
      // An unpaid hold has to be resolved before the books can close — the
      // same block the admin spec asserts from the UI side.
      if (row.status === "reserved") {
        await organizer.rpc("confirm_booking", {
          p_booking_id: row.id,
          p_confirmed_by: players.organizer.id,
        });
      }
      await organizer.rpc("mark_attendance", { p_booking_id: row.id, p_attendance: "present" });
    }
    expect(await eventsFor()).toContain("attendance_marked");

    await organizer.rpc("settle_game", { p_game_id: game.id });
    expect(await eventsFor()).toContain("game_settled");
  } finally {
    await destroyScratchGame(game.id);
    await setWalletTo(players.runner.id, 0);
  }
});

test("expiry and cancellation write their own events too", async () => {
  const game = await createScratchGame({ capacity: 2, hoursFromNow: 6 });
  const admin = serviceClient();

  try {
    const runner = await apiClientFor(players.runner);
    const filler = await apiClientFor(players.seedBot);
    const { data: booking } = await runner.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "qr",
    });
    await filler.rpc("create_booking", { p_game_id: game.id, p_payment_method: "cash" });

    const waiter = await apiClientFor(players.creditRich);
    await waiter.rpc("join_waitlist", { p_game_id: game.id });

    await admin.rpc("mark_nudged", { p_booking_id: booking.id, p_grace_hours: 12 });
    await expireDeadline(booking.id);
    await admin.rpc("expire_booking", { p_booking_id: booking.id });

    const { data } = await admin.from("events").select("event_type").eq("game_id", game.id);
    const types = new Set((data ?? []).map((row: { event_type: string }) => row.event_type));

    expect(types).toContain("booking_expired");
    expect(types).toContain("spot_released");

    // A cancelled GAME is its own event, distinct from a cancelled booking.
    await admin.rpc("cancel_game", { p_game_id: game.id });
    const { data: afterCancel } = await admin
      .from("events")
      .select("event_type")
      .eq("game_id", game.id);
    expect(
      new Set((afterCancel ?? []).map((row: { event_type: string }) => row.event_type)),
    ).toContain("game_cancelled");
  } finally {
    await destroyScratchGame(game.id);
  }
});

test.describe("cron idempotency", () => {
  const routes = ["nudge", "expiry", "reminder"] as const;

  test("every cron route rejects a request without the shared secret", async ({ request }) => {
    for (const route of routes) {
      const bare = await request.get(`/api/cron/${route}`);
      expect(bare.status()).toBe(401);

      const wrong = await request.get(`/api/cron/${route}`, {
        headers: { authorization: "Bearer not-the-secret" },
      });
      expect(wrong.status()).toBe(401);
    }
  });

  test("a double run produces no duplicate events", async ({ request }) => {
    // A game inside both the nudge (12h) and reminder (24h) windows, with a
    // waiting player so the nudge has its scarcity justification.
    const game = await createScratchGame({ capacity: 2, hoursFromNow: 6 });
    const admin = serviceClient();

    try {
      const runner = await apiClientFor(players.runner);
      const filler = await apiClientFor(players.seedBot);
      const { data: unpaid } = await runner.rpc("create_booking", {
        p_game_id: game.id,
        p_payment_method: "qr",
      });
      const { data: paid } = await filler.rpc("create_booking", {
        p_game_id: game.id,
        p_payment_method: "cash",
      });
      await admin.rpc("confirm_booking", {
        p_booking_id: paid.id,
        p_confirmed_by: players.organizer.id,
      });

      const waiter = await apiClientFor(players.creditRich);
      await waiter.rpc("join_waitlist", { p_game_id: game.id });

      const countEvents = async () => {
        const { data } = await admin.from("events").select("event_type").eq("game_id", game.id);
        const counts: Record<string, number> = {};
        for (const row of (data ?? []) as { event_type: string }[]) {
          counts[row.event_type] = (counts[row.event_type] ?? 0) + 1;
        }
        return counts;
      };

      for (const route of routes) {
        const first = await request.get(`/api/cron/${route}`, {
          headers: { authorization: `Bearer ${CRON_SECRET}` },
        });
        expect(first.ok()).toBeTruthy();
      }

      const afterFirst = await countEvents();

      // The second sweep, immediately. Vercel Cron retries, and a retry that
      // re-sends every nudge is worse than one that misses a sweep: the guard
      // is a stamp on the row (`nudge_sent_at`, `reminder_sent_at`), checked
      // and set inside the RPC rather than in the route.
      for (const route of routes) {
        const second = await request.get(`/api/cron/${route}`, {
          headers: { authorization: `Bearer ${CRON_SECRET}` },
        });
        expect(second.ok()).toBeTruthy();
      }

      const afterSecond = await countEvents();
      expect(afterSecond).toEqual(afterFirst);

      // Exactly one nudge for the unpaid hold, and the paid one was never
      // touched at all.
      const { data: bookings } = await admin
        .from("bookings")
        .select("id,nudge_sent_at")
        .eq("game_id", game.id);
      const nudgedRows = (bookings ?? []).filter(
        (row: { nudge_sent_at: string | null }) => row.nudge_sent_at !== null,
      );
      expect(nudgedRows).toHaveLength(1);
      expect((nudgedRows[0] as { id: string }).id).toBe(unpaid.id);
    } finally {
      await destroyScratchGame(game.id);
    }
  });
});
