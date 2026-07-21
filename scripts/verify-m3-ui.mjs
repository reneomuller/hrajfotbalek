// =============================================================================
// M3 verification, part 2 — the email call sites that live in APP code.
//
//   node scripts/verify-m3-ui.mjs         (requires the dev server running)
//
// verify-m3.mjs drives the RPCs and the cron routes directly, which exercises
// the four cron/waitlist emails but bypasses the server actions. The remaining
// templates fire from booking and cancellation actions, so this script drives
// those through the real UI in a browser.
//
// Creates throwaway fixtures and removes them afterwards. EMAIL_DRY_RUN stays
// on; the evidence is the server's dry-run log.
// =============================================================================
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!m) continue;
  env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const BASE = 'http://localhost:3000';
const STAMP = Date.now();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];
const check = (ok, label, detail = '') => {
  results.push({ ok, label, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
};
const step = (name) => console.log(`\n=== ${name} ===`);

const made = { users: [], players: [], games: [] };

async function makeGame(venue, capacity = 4) {
  const { data, error } = await admin
    .from('games')
    .insert({
      venue: `${venue} ${STAMP}`,
      starts_at: new Date(Date.now() + 96 * 3600_000).toISOString(),
      capacity,
      price_czk: 200,
      status: 'published',
    })
    .select('id, venue')
    .single();
  if (error) throw new Error(error.message);
  made.games.push(data.id);
  return data;
}

/** Signs a fresh browser session in through the real magic-link callback. */
async function signUp(page, tag) {
  const email = `m3ui-${tag}-${STAMP}@example.invalid`;
  const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw new Error(error.message);
  made.users.push(created.user.id);

  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const cb = new URL(`${BASE}/auth/callback`);
  cb.searchParams.set('token_hash', link.properties.hashed_token);
  cb.searchParams.set('type', 'magiclink');
  cb.searchParams.set('next', '/games');
  await page.goto(cb.toString(), { waitUntil: 'networkidle' });

  if (page.url().includes('/signup')) {
    await page.fill('input[name=nickname]', `UI${tag}${String(STAMP).slice(-4)}`);
    await page.check('input[name=gdpr]');
    await page.click('button[type=submit]');
    await page.waitForLoadState('networkidle');
  }

  // The signup action redirects on success; poll rather than assume timing.
  let player = null;
  for (let i = 0; i < 8; i++) {
    const { data } = await admin
      .from('players').select('id').eq('auth_user_id', created.user.id).maybeSingle();
    if (data) { player = data; break; }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!player) console.log(`  (signup landed on ${page.url()})`);
  if (player) made.players.push(player.id);
  return player?.id ?? null;
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

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });

  step('booking through the UI -> spot-held email');
  const gameA = await makeGame('M3 UI Book');
  const playerId = await signUp(page, 'a');
  check(!!playerId, 'signed up a fresh player through the real callback');

  await page.goto(`${BASE}/game/${gameA.id}/book`, { waitUntil: 'networkidle' });
  await Promise.all([
    page.waitForURL(/confirmation/, { timeout: 20000 }),
    page.click('[data-testid=confirm-booking]'),
  ]);
  check(page.url().includes('/confirmation'), 'QR booking completed through the UI');

  step('cancellation through the UI -> credit receipt');
  // Confirm it first so the cancellation returns real money.
  const { data: booking } = await admin
    .from('bookings').select('id').eq('game_id', gameA.id).maybeSingle();
  await admin.rpc('confirm_booking', {
    p_booking_id: booking.id,
    p_confirmed_by: playerId,
    p_received_amount_czk: 200,
  });

  await page.goto(`${BASE}/account`, { waitUntil: 'networkidle' });
  // The form guards with window.confirm — auto-accept it, the same way a
  // player tapping OK would.
  page.on('dialog', (dialog) => dialog.accept());
  const cancelButton = await page.$('[data-testid=cancel-booking]');
  check(!!cancelButton, 'account offers the cancel control');
  if (cancelButton) {
    await cancelButton.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2500);
  }

  const { data: after } = await admin
    .from('bookings').select('status').eq('id', booking.id).maybeSingle();
  check(after?.status === 'cancelled', 'the booking is cancelled', after?.status ?? 'missing');

  const { data: ledger } = await admin
    .from('credit_ledger').select('delta_czk').eq('player_id', playerId);
  check(
    ledger.reduce((s, r) => s + r.delta_czk, 0) === 200,
    'credit landed in the ledger',
    `${ledger.reduce((s, r) => s + r.delta_czk, 0)} CZK`,
  );

  step('full-credit booking -> payment-confirmed, spot-held suppressed');
  const gameB = await makeGame('M3 UI Credit');
  await page.goto(`${BASE}/game/${gameB.id}/book`, { waitUntil: 'networkidle' });
  await Promise.all([
    page.waitForURL(/confirmation/, { timeout: 20000 }),
    page.click('[data-testid=confirm-booking]'),
  ]);

  const { data: creditBooking } = await admin
    .from('bookings').select('status, payment_method').eq('game_id', gameB.id).maybeSingle();
  check(
    creditBooking?.status === 'confirmed' && creditBooking?.payment_method === 'credit',
    'the wallet covered the price: instant-confirmed as credit',
    `${creditBooking?.status}/${creditBooking?.payment_method}`,
  );
} catch (error) {
  check(false, 'run aborted', error.message);
} finally {
  await browser.close();
  await cleanup();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
