// =============================================================================
// M3 lifecycle verification against the live database.
//
//   node scripts/verify-m3.mjs            (requires the dev server running)
//
// Drives every M3 path end to end and reports, per email type, whether the
// dry-run seam logged it. Creates a self-contained fixture set (throwaway auth
// users, players, games) and removes all of it afterwards, including on
// failure.
//
// EMAIL_DRY_RUN stays on: nothing here can send real mail. The evidence is the
// server's dry-run log, which the caller tails.
//
// SUPABASE_DB_URL / service-role key are read from .env.local and never printed.
// =============================================================================
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!m) continue;
  env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const CRON_SECRET = env.CRON_SECRET;
const STAMP = Date.now();

/**
 * Fixture time-travel.
 *
 * service_role deliberately holds NO update grant on `bookings` — every write
 * goes through an RPC, which is exactly the invariant this project rests on.
 * So moving a deadline into the past for a test is done on the direct
 * connection, the same device supabase/tests/*.sql uses to simulate elapsed
 * time. It is time travel, not a state the RPCs cannot produce: the nudge sweep
 * writes this column, this only makes it older.
 */
async function timeTravel(sql, params) {
  const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql, params);
  } finally {
    await client.end();
  }
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];
const check = (ok, label, detail = '') => {
  results.push({ ok, label, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
};
const step = (name) => console.log(`\n=== ${name} ===`);

const cron = (route) =>
  fetch(`${BASE}/api/cron/${route}`, { headers: { 'x-cron-secret': CRON_SECRET } });

// --- fixtures ----------------------------------------------------------------
const made = { users: [], players: [], games: [] };

async function makePlayer(tag) {
  const email = `m3-${tag}-${STAMP}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw new Error(`createUser ${tag}: ${error.message}`);
  made.users.push(data.user.id);

  const { data: player, error: pErr } = await admin
    .from('players')
    .insert({ nickname: `M3${tag}${String(STAMP).slice(-4)}`, email, auth_user_id: data.user.id })
    .select('id, nickname, email')
    .single();
  if (pErr) throw new Error(`insert player ${tag}: ${pErr.message}`);
  made.players.push(player.id);

  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const { error: vErr } = await client.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (vErr) throw new Error(`session ${tag}: ${vErr.message}`);

  return { ...player, client };
}

async function makeGame(venue, { capacity = 1, hours = 72, status = 'published' } = {}) {
  const { data, error } = await admin
    .from('games')
    .insert({
      venue: `${venue} ${STAMP}`,
      starts_at: new Date(Date.now() + hours * 3600_000).toISOString(),
      capacity,
      price_czk: 200,
      status,
    })
    .select('id, venue, starts_at')
    .single();
  if (error) throw new Error(`insert game: ${error.message}`);
  made.games.push(data.id);
  return data;
}

async function cleanup() {
  for (const id of made.games) {
    await admin.from('events').delete().eq('game_id', id);
    await admin.from('waitlist').delete().eq('game_id', id);
    await admin.from('bookings').delete().eq('game_id', id);
    await admin.from('games').delete().eq('id', id);
  }
  for (const id of made.players) {
    await admin.from('events').delete().eq('player_id', id);
    await admin.from('credit_ledger').delete().eq('player_id', id);
    await admin.from('players').delete().eq('id', id);
  }
  for (const id of made.users) await admin.auth.admin.deleteUser(id);
  console.log('\ncleanup: fixtures removed');
}

// --- run ---------------------------------------------------------------------
try {
  if (!CRON_SECRET) throw new Error('CRON_SECRET missing from .env.local');

  step('cron guard');
  const noSecret = await fetch(`${BASE}/api/cron/expiry`);
  check(noSecret.status === 401, 'expiry route rejects a request with no secret', `status ${noSecret.status}`);
  const wrongSecret = await fetch(`${BASE}/api/cron/expiry`, { headers: { 'x-cron-secret': 'wrong' } });
  check(wrongSecret.status === 401, 'expiry route rejects a wrong secret', `status ${wrongSecret.status}`);
  const body = await noSecret.json();
  check(body.error === 'CRON_UNAUTHORIZED', 'rejection body is CRON_UNAUTHORIZED', JSON.stringify(body));

  step('fixtures');
  const alice = await makePlayer('alice');
  const bob = await makePlayer('bob');
  const carol = await makePlayer('carol');
  const game = await makeGame('M3 Loop', { capacity: 1, hours: 72 });
  check(true, 'created three players and a capacity-1 game', game.id);

  step('booking -> spot-held email');
  const { data: aliceBooking, error: bookErr } = await alice.client.rpc('create_booking', {
    p_game_id: game.id,
    p_payment_method: 'qr',
  });
  check(!bookErr && aliceBooking?.id, 'alice books the only spot', bookErr?.message ?? aliceBooking?.status);

  const { data: gameNow } = await admin.from('games').select('status').eq('id', game.id).single();
  check(gameNow.status === 'full', 'the game flipped to full automatically', gameNow.status);

  step('waitlist join');
  for (const [name, player] of [['bob', bob], ['carol', carol]]) {
    const { data, error } = await player.client.rpc('join_waitlist', { p_game_id: game.id });
    check(!error && data?.id, `${name} joins the waitlist`, error?.message ?? '');
  }
  const { data: dup } = await bob.client.rpc('join_waitlist', { p_game_id: game.id });
  check(dup?.already_joined === true, 'a duplicate join reports already_joined instead of erroring');

  step('nudge sweep');
  const nudge1 = await (await cron('nudge')).json();
  check(nudge1.nudged >= 1, 'nudge sweep nudges the unpaid reservation', JSON.stringify(nudge1));
  const nudge2 = await (await cron('nudge')).json();
  check(nudge2.nudged === 0 && nudge2.emails === 0, 'IDEMPOTENT: second nudge run sends nothing', JSON.stringify(nudge2));

  const { data: nudgeEvents } = await admin
    .from('events').select('id').eq('game_id', game.id).eq('event_type', 'nudge_sent');
  check(nudgeEvents.length === 1, 'exactly one nudge_sent event after two runs', `count ${nudgeEvents.length}`);

  step('reminder sweep');
  // Move kickoff inside the 24h window so the reminder route sees it.
  await admin.from('games')
    .update({ starts_at: new Date(Date.now() + 6 * 3600_000).toISOString() })
    .eq('id', game.id);

  const rem1 = await (await cron('reminder')).json();
  check(rem1.reminded >= 1, 'reminder sweep reminds the active booking', JSON.stringify(rem1));
  const rem2 = await (await cron('reminder')).json();
  check(rem2.reminded === 0 && rem2.emails === 0, 'IDEMPOTENT: second reminder run sends nothing', JSON.stringify(rem2));

  const { data: remEvents } = await admin
    .from('events').select('id').eq('game_id', game.id).eq('event_type', 'reminder_sent');
  check(remEvents.length === 1, 'exactly one reminder_sent event after two runs', `count ${remEvents.length}`);

  step('expiry sweep + waitlist fan-out');
  // mark_nudged set expires_at to now()+grace; pull it into the past so the
  // sweep sees a lapsed reservation.
  await timeTravel(
    "update public.bookings set expires_at = now() - interval '1 hour' where id = $1",
    [aliceBooking.id],
  );

  const exp1 = await (await cron('expiry')).json();
  check(exp1.expired === 1, 'expiry sweep expires the lapsed reservation', JSON.stringify(exp1));
  check(exp1.waitlistNotified >= 2, 'the released spot notified both waitlisted players', `${exp1.waitlistNotified}`);

  const exp2 = await (await cron('expiry')).json();
  check(exp2.expired === 0 && exp2.expiryEmails === 0, 'IDEMPOTENT: second expiry run expires nothing', JSON.stringify(exp2));

  const { data: expEvents } = await admin
    .from('events').select('event_type').eq('game_id', game.id)
    .in('event_type', ['booking_expired', 'spot_released', 'waitlist_notified']);
  const counts = expEvents.reduce((acc, e) => ({ ...acc, [e.event_type]: (acc[e.event_type] ?? 0) + 1 }), {});
  check(counts.booking_expired === 1, 'exactly one booking_expired event after two runs', JSON.stringify(counts));
  check(counts.waitlist_notified === 2, 'two waitlist_notified events — one per waiting player', JSON.stringify(counts));

  step('waitlist conversion (FCFS)');
  const { data: bobWait } = await bob.client.from('waitlist').select('id').eq('game_id', game.id).single();
  const { data: carolWait } = await carol.client.from('waitlist').select('id').eq('game_id', game.id).single();

  const [bobConv, carolConv] = await Promise.all([
    bob.client.rpc('create_booking', { p_game_id: game.id, p_payment_method: 'cash', p_from_waitlist_id: bobWait.id }),
    carol.client.rpc('create_booking', { p_game_id: game.id, p_payment_method: 'cash', p_from_waitlist_id: carolWait.id }),
  ]);
  const winners = [bobConv, carolConv].filter((r) => !r.error);
  const losers = [bobConv, carolConv].filter((r) => r.error);
  check(winners.length === 1, 'exactly one of the two concurrent conversions won', `winners ${winners.length}`);
  check(
    losers.length === 1 && losers[0].error.message.includes('CAPACITY_FULL'),
    'the loser got CAPACITY_FULL, not a crash',
    losers[0]?.error?.message ?? '',
  );

  const { data: convEvents } = await admin
    .from('events').select('id').eq('game_id', game.id).eq('event_type', 'waitlist_converted');
  check(convEvents.length === 1, 'exactly one waitlist_converted event', `count ${convEvents.length}`);

  step('cancellation -> credit -> release -> notify');
  const winnerBooking = winners[0].data;
  const winnerClient = bobConv.error ? carol.client : bob.client;
  const winnerId = bobConv.error ? carol.id : bob.id;

  // Confirm it so the cancellation returns real money as credit.
  await admin.rpc('confirm_booking', { p_booking_id: winnerBooking.id, p_confirmed_by: winnerId });

  const { data: cancelResult, error: cancelErr } = await winnerClient.rpc('cancel_booking', {
    p_booking_id: winnerBooking.id,
  });
  check(!cancelErr, 'the confirmed booking cancels', cancelErr?.message ?? '');
  check(cancelResult?.credit_issued_czk === 200, 'credit issued equals the price paid', `${cancelResult?.credit_issued_czk} CZK`);

  const { data: ledger } = await admin
    .from('credit_ledger').select('delta_czk, reason').eq('player_id', winnerId);
  const balance = ledger.reduce((sum, r) => sum + r.delta_czk, 0);
  check(balance === 200, 'the ledger shows the credit', `balance ${balance}`);

  const { data: releaseEvents } = await admin
    .from('events').select('event_type').eq('game_id', game.id).eq('event_type', 'spot_released');
  check(releaseEvents.length === 2, 'the cancellation emitted a second spot_released', `count ${releaseEvents.length}`);

  step('game cancellation fan-out');
  const rainGame = await makeGame('M3 Rained Off', { capacity: 4, hours: 96 });
  const { data: rainBooking } = await alice.client.rpc('create_booking', {
    p_game_id: rainGame.id, p_payment_method: 'qr',
  });
  await admin.rpc('confirm_booking', { p_booking_id: rainBooking.id, p_confirmed_by: alice.id });
  const { error: cgErr } = await admin.rpc('cancel_game', { p_game_id: rainGame.id });
  check(!cgErr, 'cancel_game runs', cgErr?.message ?? '');

  const { data: rainEvents } = await admin
    .from('events').select('event_type, metadata').eq('game_id', rainGame.id);
  const hasGameCancelled = rainEvents.some((e) => e.event_type === 'game_cancelled');
  const hasCredit = rainEvents.some((e) => e.event_type === 'credit_issued');
  check(hasGameCancelled && hasCredit, 'game_cancelled + credit_issued written', JSON.stringify(rainEvents.map((e) => e.event_type)));

  const { error: twiceErr } = await admin.rpc('cancel_game', { p_game_id: rainGame.id });
  check(
    twiceErr?.message?.includes('INVALID_TRANSITION'),
    'IDEMPOTENT: cancelling an already-cancelled game is refused, so no second fan-out',
    twiceErr?.message ?? 'no error',
  );
} catch (error) {
  check(false, 'run aborted', error.message);
} finally {
  await cleanup();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
