/**
 * Seed / fixture script v1.
 *
 * Run:  npm run seed          (reset + seed; idempotent)
 *       npm run seed:reset    (reset only)
 *
 * THE RULE THAT GOVERNS THIS FILE: only BASE ROWS (players, games) are
 * inserted directly. Every state transition — bookings, confirmations,
 * cancellations, expiries, game status changes, and every credit movement —
 * goes through the real RPCs. If the seed could fabricate a state the RPCs
 * cannot produce, the fixtures would stop being a faithful model of production
 * and tests would start passing against impossible states.
 *
 * Two consequences worth stating, because they look like detours:
 *
 *   - Wallet credit is minted by OVERPAYING a real booking through
 *     confirm_booking, not by inserting into credit_ledger. grant_credit does
 *     not exist until Phase 25, and credit_ledger is append-only by privilege,
 *     so overpayment is the only sanctioned way to put credit in a wallet at
 *     this point in the sequence. It also happens to be realistic.
 *
 *   - Owner-only RPCs (create_booking, cancel_booking) are called through REAL
 *     SIGNED-IN SESSIONS, not the service-role client. Their whole safety story
 *     is that identity comes from auth.uid(). Weakening them to accommodate
 *     seeding would be exactly backwards, so the seed creates auth users and
 *     signs in as them instead.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  SEED_PASSWORD,
  allGameIds,
  allPlayerIds,
  allVenueNames,
  games,
  players,
  type PlayerFixture,
} from "./fixtures.ts";

// -----------------------------------------------------------------------------
// clients
//
// Built here rather than imported from lib/supabase/clients.ts: that module
// imports `next/headers` at the top level for the server client, which is not
// resolvable outside a Next request context. The service-role guards from that
// file are reproduced below so the safety properties do not regress.
// -----------------------------------------------------------------------------

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const ANON_KEY = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

if (process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY is set. The service-role key must " +
      "never carry a NEXT_PUBLIC_ prefix.",
  );
}
if (SERVICE_ROLE_KEY === ANON_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is identical to the anon key.");
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const admin: SupabaseClient<any> = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function check(label: string, error: { message: string } | null): void {
  if (error) throw new Error(`${label}: ${error.message}`);
}

/** A client carrying a real player session, so auth.uid() resolves to them. */
async function signInAs(fixture: PlayerFixture): Promise<SupabaseClient<any>> {
  if (!fixture.email) throw new Error(`${fixture.nickname} has no email to sign in with`);

  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({
    email: fixture.email,
    password: SEED_PASSWORD,
  });
  check(`sign in as ${fixture.nickname}`, error);
  if (!data.session) throw new Error(`no session for ${fixture.nickname}`);

  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

// -----------------------------------------------------------------------------
// reset
// -----------------------------------------------------------------------------

async function reset(): Promise<void> {
  // Reverse dependency order. Scoped to fixture ids so a database holding real
  // data alongside the fixtures keeps it.
  check("delete events (by player)", (await admin.from("events").delete().in("player_id", allPlayerIds)).error);
  check("delete events (by game)", (await admin.from("events").delete().in("game_id", allGameIds)).error);
  check("delete credit_ledger", (await admin.from("credit_ledger").delete().in("player_id", allPlayerIds)).error);
  check("delete waitlist", (await admin.from("waitlist").delete().in("player_id", allPlayerIds)).error);
  check("delete bookings", (await admin.from("bookings").delete().in("player_id", allPlayerIds)).error);
  check("delete games", (await admin.from("games").delete().in("id", allGameIds)).error);
  check("delete players", (await admin.from("players").delete().in("id", allPlayerIds)).error);

  // After the games, which reference them ON DELETE RESTRICT. Scoped to the
  // fixture names, so a venue an admin created by hand survives a reset.
  check("delete venues", (await admin.from("venues").delete().in("name", allVenueNames)).error);

  // Auth users last: players.auth_user_id references them.
  const { data: list, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  check("list auth users", error);
  const seedEmails = new Set(
    Object.values(players)
      .map((p) => p.email)
      .filter((e): e is string => typeof e === "string"),
  );
  for (const user of list?.users ?? []) {
    if (user.email && seedEmails.has(user.email)) {
      const { error: delError } = await admin.auth.admin.deleteUser(user.id);
      check(`delete auth user ${user.email}`, delError);
    }
  }
}

// -----------------------------------------------------------------------------
// seed
// -----------------------------------------------------------------------------

function startsAt(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 3600_000).toISOString();
}

async function seed(): Promise<void> {
  // --- auth users + players (BASE ROWS: direct insert is sanctioned) ---------
  const authIds = new Map<string, string>();

  for (const fixture of Object.values(players)) {
    if (!fixture.needsSession || !fixture.email) continue;
    const { data, error } = await admin.auth.admin.createUser({
      email: fixture.email,
      password: SEED_PASSWORD,
      email_confirm: true,
    });
    check(`create auth user ${fixture.email}`, error);
    authIds.set(fixture.id, data.user!.id);
  }

  check(
    "insert players",
    (
      await admin.from("players").insert(
        Object.values(players).map((p) => ({
          id: p.id,
          nickname: p.nickname,
          email: p.email,
          phone: p.phone,
          auth_user_id: authIds.get(p.id) ?? null,
          is_admin: p.isAdmin,
          is_seed: p.isSeed,
        })),
      )
    ).error,
  );

  // --- venues ---------------------------------------------------------------
  // Through `admin_create_venue` rather than a direct insert: venues are not
  // state-bearing, but the RPC already owns the name-clash rule, and a seed
  // that reuses an existing venue is the behaviour we want on a database that
  // already has one. Every fixture game gets one — a game with a null
  // `venue_id` cannot be saved from the admin edit form (migration 19).
  const venueIds = new Map<string, string>();

  for (const name of allVenueNames) {
    const { data: existing, error: lookupError } = await admin
      .from("venues")
      .select("id")
      .eq("name", name)
      .maybeSingle();
    check(`look up venue ${name}`, lookupError);

    if (existing) {
      venueIds.set(name, existing.id);
      continue;
    }

    const { data, error } = await admin.rpc("admin_create_venue", {
      p_name: name,
      p_image_path: null,
      p_map_query: null,
    });
    check(`create venue ${name}`, error);
    venueIds.set(name, data as string);
  }

  // Games are inserted as DRAFT and reach every other status through the real
  // transition RPCs. games.status is a state-bearing column: the insert is a
  // base row, but no UPDATE of it happens outside an RPC.
  check(
    "insert games",
    (
      await admin.from("games").insert(
        Object.values(games).map((g) => ({
          id: g.id,
          venue: g.venue,
          venue_id: venueIds.get(g.venue) ?? null,
          starts_at: startsAt(g.startsInHours),
          capacity: g.capacity,
          price_czk: g.priceCzk,
          status: "draft",
        })),
      )
    ).error,
  );

  // --- publish everything except the draft fixture --------------------------
  for (const game of Object.values(games)) {
    if (game.id === games.draft.id) continue;
    check(`publish ${game.venue}`, (await admin.rpc("publish_game", { p_game_id: game.id })).error);
  }

  // --- sessions -------------------------------------------------------------
  const asOrganizer = await signInAs(players.organizer);
  const asRunner = await signInAs(players.runner);
  const asRich = await signInAs(players.creditRich);
  const asPartial = await signInAs(players.creditPartial);
  const asSeedBot = await signInAs(players.seedBot);

  // --- mint wallet credit via real overpayment confirmations ----------------
  //
  // Amounts are chosen so the paths are both EXERCISED and still VISIBLE
  // afterwards. Credit auto-applies to the next booking, so a player given
  // exactly one game's worth ends at zero and the admin UI has no standing
  // balance to render. CreditRich is given 450 (200 price + 250 headroom): the
  // full-credit instant-confirm path fires, and 250 remains on the wallet.
  for (const [session, playerId, received] of [
    [asRich, players.creditRich.id, 650],
    [asPartial, players.creditPartial.id, 250],
  ] as const) {
    const { data: booking, error } = await session.rpc("create_booking", {
      p_game_id: games.creditSource.id,
      p_payment_method: "qr",
    });
    check(`credit-source booking for ${playerId}`, error);

    check(
      `overpay-confirm for ${playerId}`,
      (
        await admin.rpc("confirm_booking", {
          p_booking_id: booking.id,
          p_confirmed_by: players.organizer.id,
          p_received_amount_czk: received,
        })
      ).error,
    );
  }

  // --- bookings in every state ----------------------------------------------

  // RESERVED, with partial credit applied (50 of 200 => 150 due, keeps qr).
  check(
    "partial-credit reserved booking",
    (
      await asPartial.rpc("create_booking", {
        p_game_id: games.published.id,
        p_payment_method: "qr",
      })
    ).error,
  );

  // CONFIRMED by derivation: balance covers the price, so create_booking
  // returns `credit`, confirmed, no VS. The script only ever says qr.
  const { data: creditBooking, error: creditError } = await asRich.rpc("create_booking", {
    p_game_id: games.published.id,
    p_payment_method: "qr",
  });
  check("full-credit booking", creditError);
  if (creditBooking.payment_method !== "credit" || creditBooking.status !== "confirmed") {
    throw new Error(
      `expected a derived credit/confirmed booking, got ` +
        `${creditBooking.payment_method}/${creditBooking.status}`,
    );
  }

  // seed_free by derivation from is_seed. Again, the script says qr.
  const { data: seedBooking, error: seedError } = await asSeedBot.rpc("create_booking", {
    p_game_id: games.published.id,
    p_payment_method: "qr",
  });
  check("seed booking", seedError);
  if (
    seedBooking.payment_method !== "seed_free" ||
    seedBooking.status !== "confirmed" ||
    seedBooking.price_czk !== 0
  ) {
    throw new Error(
      `expected seed_free/confirmed/0, got ${seedBooking.payment_method}/` +
        `${seedBooking.status}/${seedBooking.price_czk}`,
    );
  }

  // EXPIRED.
  const { data: expiring, error: expiringError } = await asRunner.rpc("create_booking", {
    p_game_id: games.expiry.id,
    p_payment_method: "qr",
  });
  check("expiring booking", expiringError);
  check(
    "expire booking",
    (await admin.rpc("expire_booking", { p_booking_id: expiring.id })).error,
  );

  // CANCELLED, by the player themselves.
  const { data: doomed, error: doomedError } = await asRunner.rpc("create_booking", {
    p_game_id: games.published.id,
    p_payment_method: "cash",
  });
  check("cancellable booking", doomedError);
  check(
    "cancel booking",
    (await asRunner.rpc("cancel_booking", { p_booking_id: doomed.id })).error,
  );

  // --- FULL: two bookings on a capacity-2 game flips it automatically -------
  check(
    "full game booking 1",
    (await asRunner.rpc("create_booking", { p_game_id: games.full.id, p_payment_method: "cash" }))
      .error,
  );
  // Organizer, not CreditRich: a booking by CreditRich would silently spend the
  // headroom that is meant to survive the seed as a visible balance.
  check(
    "full game booking 2",
    (
      await asOrganizer.rpc("create_booking", {
        p_game_id: games.full.id,
        p_payment_method: "cash",
      })
    ).error,
  );

  // --- WAITLIST: two players queue on the now-full game ---------------------
  //
  // Created through join_waitlist under real sessions, never a direct insert:
  // the row and its waitlist_joined event have to land in one transaction, and
  // a fabricated row would carry no event for Phase 26's depth metric to count.
  // The game flipped to 'full' automatically above, which is what makes the
  // join legal — join_waitlist refuses anything else.
  for (const [label, session] of [
    ["creditRich", asRich],
    ["creditPartial", asPartial],
  ] as const) {
    check(
      `waitlist join by ${label}`,
      (await session.rpc("join_waitlist", { p_game_id: games.full.id })).error,
    );
  }

  // --- PLAYED and SETTLED ---------------------------------------------------
  for (const [game, session] of [
    [games.played, asRunner],
    [games.settled, asOrganizer],
  ] as const) {
    const { data: booking, error } = await session.rpc("create_booking", {
      p_game_id: game.id,
      p_payment_method: "cash",
    });
    check(`booking on ${game.venue}`, error);
    check(
      `confirm on ${game.venue}`,
      (
        await admin.rpc("confirm_booking", {
          p_booking_id: booking.id,
          p_confirmed_by: players.organizer.id,
        })
      ).error,
    );
    check(`mark played ${game.venue}`, (await admin.rpc("mark_game_played", { p_game_id: game.id })).error);
  }
  check("settle game", (await admin.rpc("settle_game", { p_game_id: games.settled.id })).error);

  // Bookings require a future kickoff, so these games were created in the
  // future, booked, and are only now moved into the past. starts_at is not a
  // state-bearing column (games.status is); this is simulating elapsed time,
  // not fabricating a state.
  for (const game of [games.played, games.settled]) {
    check(
      `backdate ${game.venue}`,
      (
        await admin
          .from("games")
          .update({ starts_at: startsAt(-24) })
          .eq("id", game.id)
      ).error,
    );
  }

  // --- CANCELLED GAME: fan-out cancels bookings and credits the paid one ----
  const { data: rainedOff, error: rainedOffError } = await asRunner.rpc("create_booking", {
    p_game_id: games.cancelled.id,
    p_payment_method: "qr",
  });
  check("rained-off booking", rainedOffError);
  check(
    "confirm rained-off booking",
    (
      await admin.rpc("confirm_booking", {
        p_booking_id: rainedOff.id,
        p_confirmed_by: players.organizer.id,
      })
    ).error,
  );
  check("cancel game", (await admin.rpc("cancel_game", { p_game_id: games.cancelled.id })).error);

  // --- ADMIN books a SHADOW player (act-on-behalf path) ---------------------
  check(
    "admin books shadow player",
    (
      await asOrganizer.rpc("admin_create_booking", {
        p_game_id: games.published.id,
        p_player_id: players.shadowWithEmail.id,
        p_payment_method: "cash",
      })
    ).error,
  );
}

// -----------------------------------------------------------------------------
// verification — the acceptance criteria, checked in-process
// -----------------------------------------------------------------------------

async function verify(): Promise<void> {
  const problems: string[] = [];

  const { data: gameRows } = await admin.from("games").select("id,status").in("id", allGameIds);
  const statuses = new Set((gameRows ?? []).map((g: { status: string }) => g.status));
  for (const wanted of ["draft", "published", "full", "played", "settled", "cancelled"]) {
    if (!statuses.has(wanted)) problems.push(`no game in status ${wanted}`);
  }

  const { data: bookingRows } = await admin
    .from("bookings")
    .select("id,status,payment_method,price_czk")
    .in("player_id", allPlayerIds);
  const bookingStatuses = new Set((bookingRows ?? []).map((b: { status: string }) => b.status));
  for (const wanted of ["reserved", "confirmed", "cancelled", "expired"]) {
    if (!bookingStatuses.has(wanted)) problems.push(`no booking in status ${wanted}`);
  }

  const seedFree = (bookingRows ?? []).filter(
    (b: { payment_method: string; price_czk: number }) =>
      b.payment_method === "seed_free" && b.price_czk === 0,
  );
  if (seedFree.length === 0) problems.push("no seed_free booking at price 0");

  const { data: ledger } = await admin
    .from("credit_ledger")
    .select("player_id,delta_czk")
    .in("player_id", allPlayerIds);
  const balances = new Map<string, number>();
  for (const row of (ledger ?? []) as { player_id: string; delta_czk: number }[]) {
    balances.set(row.player_id, (balances.get(row.player_id) ?? 0) + row.delta_czk);
  }
  if (![...balances.values()].some((v) => v > 0)) problems.push("no player has a positive balance");
  for (const [playerId, balance] of balances) {
    if (balance < 0) problems.push(`player ${playerId} has a NEGATIVE balance (${balance})`);
  }

  // A standing balance that exceeds a game price must SURVIVE the seed, not
  // merely have existed part-way through it. Credit auto-applies to the next
  // booking, so it is easy to leave every wallet at zero while still believing
  // the credit fixtures are present — which is exactly what happened first time.
  const richBalance = balances.get(players.creditRich.id) ?? 0;
  if (richBalance < games.published.priceCzk) {
    problems.push(
      `CreditRich must end with a balance above a game price ` +
        `(${games.published.priceCzk}), has ${richBalance}`,
    );
  }

  // And the full-credit instant-confirm path must actually have fired.
  const derivedCredit = (bookingRows ?? []).filter(
    (b: { payment_method: string; status: string }) =>
      b.payment_method === "credit" && b.status === "confirmed",
  );
  if (derivedCredit.length === 0) {
    problems.push("no booking was derived as payment_method=credit");
  }

  const { count: waitlistCount } = await admin
    .from("waitlist")
    .select("*", { count: "exact", head: true })
    .in("player_id", allPlayerIds);
  if ((waitlistCount ?? 0) !== 0) problems.push(`seed v1 must create no waitlist rows (found ${waitlistCount})`);

  // No synthetic auth-funnel events: those come from a real signup at the gate.
  const { data: authEvents } = await admin
    .from("events")
    .select("event_type")
    .in("player_id", allPlayerIds)
    .in("event_type", ["auth_link_sent", "auth_completed", "account_created", "player_claimed"]);
  if ((authEvents ?? []).length > 0) {
    problems.push(`seed wrote ${authEvents!.length} auth-funnel event(s); it must write none`);
  }

  const counts = {
    players: (await admin.from("players").select("*", { count: "exact", head: true }).in("id", allPlayerIds)).count,
    games: (await admin.from("games").select("*", { count: "exact", head: true }).in("id", allGameIds)).count,
    bookings: bookingRows?.length ?? 0,
    creditRows: ledger?.length ?? 0,
    events: (await admin.from("events").select("*", { count: "exact", head: true }).in("game_id", allGameIds)).count,
  };

  console.log("  fixture counts:", JSON.stringify(counts));
  console.log("  game statuses :", [...statuses].sort().join(", "));
  console.log("  booking states:", [...bookingStatuses].sort().join(", "));
  console.log(
    "  balances      :",
    [...balances.entries()].map(([id, v]) => `${id.slice(-4)}=${v}`).join(" "),
  );

  if (problems.length > 0) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    throw new Error(`${problems.length} seed verification failure(s)`);
  }
  console.log("  ✓ all seed acceptance checks passed");
}

// -----------------------------------------------------------------------------

const resetOnly = process.argv.includes("--reset");

try {
  console.log(resetOnly ? "Resetting fixtures…" : "Resetting, then seeding…");
  await reset();

  if (!resetOnly) {
    await seed();
    await verify();
  }
  console.log(resetOnly ? "Reset complete." : "Seed complete.");
  process.exit(0);
} catch (error) {
  console.error("SEED FAILED:", (error as Error).message);
  process.exit(1);
}
