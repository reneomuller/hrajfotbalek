/**
 * Repro: drive /auth/callback with a REAL Supabase magic-link token and assert
 * that the caller ends up holding a session.
 *
 * Uses the admin API to mint the token rather than an inbox, so this is
 * runnable in CI. It exercises the token_hash branch — stateless verification,
 * no PKCE code verifier — which isolates "can the callback establish and
 * PERSIST a session at all" from "did the browser keep its verifier cookie".
 *
 *   node --env-file=.env.local scripts/repro-auth-callback.mjs
 *
 * Requires the dev server on $BASE_URL (default http://localhost:3000).
 */
import { createClient } from '@supabase/supabase-js';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const email = `repro-${Date.now()}@example.invalid`;

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const fail = [];
const check = (cond, label, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!cond) fail.push(label);
};

// --- mint a real token -------------------------------------------------------
const { data: created, error: createError } = await admin.auth.admin.createUser({
  email,
  email_confirm: true,
});
if (createError) throw new Error(`createUser: ${createError.message}`);

const { data: link, error: linkError } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email,
});
if (linkError) throw new Error(`generateLink: ${linkError.message}`);

const tokenHash = link.properties.hashed_token;
console.log(`\nuser   ${created.user.id}\nemail  ${email}\ntoken  ${tokenHash.slice(0, 12)}…\n`);

// --- drive the callback ------------------------------------------------------
const jar = new Map();
const absorb = (res) => {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';');
    const idx = pair.indexOf('=');
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1);
    if (value === '' || /Max-Age=0/i.test(raw)) jar.delete(name);
    else jar.set(name, value);
  }
};
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

const callbackUrl = `${BASE_URL}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&action=login`;
const cbRes = await fetch(callbackUrl, { redirect: 'manual' });
absorb(cbRes);

const location = cbRes.headers.get('location') ?? '(none)';
console.log(`callback -> ${cbRes.status} ${location}`);
console.log(`cookies  -> ${[...jar.keys()].join(', ') || '(none)'}\n`);

const sessionCookies = [...jar.keys()].filter((n) => /^sb-.*auth-token/.test(n));

check(sessionCookies.length > 0, 'callback sets a Supabase session cookie',
  sessionCookies.join(', ') || 'none set');
check(!/\/login/.test(location), 'callback does not bounce to /login', location);
check(/\/signup/.test(location), 'new user with no players row is routed to /signup', location);

// --- does the session survive to the next request? ---------------------------
const signupRes = await fetch(`${BASE_URL}/signup`, {
  headers: { cookie: cookieHeader() },
  redirect: 'manual',
});
const signupLocation = signupRes.headers.get('location') ?? '(rendered)';
console.log(`\n/signup  -> ${signupRes.status} ${signupLocation}`);

check(signupRes.status === 200, '/signup renders for an authenticated row-less user',
  `status ${signupRes.status}, location ${signupLocation}`);

// --- a failed exchange must be VISIBLE, not a silent bounce to /login --------
// These are the assertions that were failing before: every failure path
// redirected to /login, which renders exactly like a signed-out visit, so a
// broken link was indistinguishable from "not signed in yet".

const noCredential = await fetch(`${BASE_URL}/auth/callback?action=login`, {
  redirect: 'manual',
});
const noCredLocation = noCredential.headers.get('location') ?? '(none)';
check(!/\/login/.test(noCredLocation),
  'callback with no credential does not silently bounce to /login', noCredLocation);
check(/\/auth\/error/.test(noCredLocation),
  'callback with no credential routes to a visible error page', noCredLocation);

const badCode = await fetch(`${BASE_URL}/auth/callback?code=not-a-real-code&action=login`, {
  redirect: 'manual',
});
const badCodeLocation = badCode.headers.get('location') ?? '(none)';
check(!/\/login/.test(badCodeLocation),
  'failed exchange does not silently bounce to /login', badCodeLocation);
check(/\/auth\/error/.test(badCodeLocation),
  'failed exchange routes to a visible error page', badCodeLocation);

// The error page must actually render the reason, not just exist.
const errorPage = await fetch(new URL(badCodeLocation, BASE_URL), { redirect: 'manual' });
const errorHtml = await errorPage.text();
check(errorPage.status === 200, 'error page renders', `status ${errorPage.status}`);
// Assert on the rendered copy, not the reason slug — the slug also appears in
// a /login?error= URL, which would let this pass against the old behaviour.
check(errorHtml.includes('Sign-in link did not work'),
  'error page renders the failure copy');
check(/code verifier not found/i.test(errorHtml),
  'error page surfaces the underlying Supabase reason');

// --- cleanup -----------------------------------------------------------------
await admin.auth.admin.deleteUser(created.user.id);

console.log(`\n${fail.length === 0 ? 'ALL PASS' : `HAS FAILURES (${fail.length})`}`);
process.exit(fail.length === 0 ? 0 : 1);
