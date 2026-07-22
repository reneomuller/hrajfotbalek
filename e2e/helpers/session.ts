import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BrowserContext, Cookie } from "@playwright/test";
import { SEED_PASSWORD, players, type PlayerFixture } from "../../scripts/fixtures.ts";

/**
 * Authenticated sessions for the E2E suite, without the inbox.
 *
 * THE MAGIC LINK IS DELIBERATELY BYPASSED. Every authenticated journey would
 * otherwise need a mail-reading step, and a suite that reads mail is a suite
 * that is slow, flaky and dependent on a third party being up. The login flow
 * itself is not going untested — it is covered by the unit tests around
 * `postAuth`, by the SQL suites on `record_auth_*`, and at the M5 gate by a
 * human signing in on a real phone, which is the only test that proves
 * delivery anyway.
 *
 * The session is minted with a password against the seeded auth users and then
 * encoded into cookies BY `@supabase/ssr` ITSELF, via a server client whose
 * cookie adapter captures what it sets. Hand-rolling that encoding would mean
 * reimplementing the chunking and base64 framing, and it would silently break
 * the day the library changed it.
 */

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const ANON_KEY = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is missing. The E2E suite runs against the seeded dev database; ` +
        `run it with:  node --env-file=.env.local`,
    );
  }
  return value;
}

interface CapturedCookie {
  name: string;
  value: string;
}

/**
 * Sessions are minted ONCE per player per run and reused.
 *
 * Supabase rate-limits password sign-ins, and the suite asks for a client in
 * almost every spec — running the full suite un-cached exhausts the limit
 * partway through and every remaining spec fails with "Request rate limit
 * reached", which looks exactly like a broken product and is not one. The
 * tokens are valid for an hour, comfortably longer than a run.
 */
const cookieCache = new Map<string, Cookie[]>();
const clientCache = new Map<string, SupabaseClient>();

/**
 * Signs in as a seeded player and returns the cookies a browser needs to be
 * that player.
 */
export async function sessionCookiesFor(player: PlayerFixture): Promise<Cookie[]> {
  if (!player.email) {
    throw new Error(`${player.nickname} is a shadow player and cannot hold a session.`);
  }

  const cached = cookieCache.get(player.id);
  if (cached) return cached;

  const captured: CapturedCookie[] = [];

  const supabase = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => [],
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) captured.push({ name, value });
      },
    },
  });

  const { error } = await supabase.auth.signInWithPassword({
    email: player.email,
    password: SEED_PASSWORD,
  });

  if (error) {
    throw new Error(
      `Could not sign in as ${player.nickname}: ${error.message}. ` +
        `Has the seed been run?  npm run seed`,
    );
  }

  const cookies: Cookie[] = captured.map(({ name, value }) => ({
    name,
    value,
    domain: "localhost",
    path: "/",
    // Session length is irrelevant to a test run; an hour outlives any suite.
    expires: Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure: false,
    sameSite: "Lax" as const,
  }));

  cookieCache.set(player.id, cookies);
  return cookies;
}

/** Makes an existing browser context act as the given seeded player. */
export async function signInAs(
  context: BrowserContext,
  player: PlayerFixture,
): Promise<void> {
  await context.addCookies(await sessionCookiesFor(player));
}

/** Signs the context out again — used by the RLS specs to test the anon view. */
export async function signOut(context: BrowserContext): Promise<void> {
  await context.clearCookies();
}

/**
 * A Supabase client acting AS a seeded player, for the specs that assert
 * through the API rather than through a page.
 *
 * Identity comes from a real session, exactly as it does in the app — the
 * cross-user rejection specs are worthless if they call the RPCs as
 * service_role, because the thing under test is `auth.uid()`.
 */
export async function apiClientFor(
  player: PlayerFixture,
): Promise<SupabaseClient> {
  if (!player.email) {
    throw new Error(`${player.nickname} is a shadow player and cannot hold a session.`);
  }

  const cached = clientCache.get(player.id);
  if (cached) return cached;

  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await supabase.auth.signInWithPassword({
    email: player.email,
    password: SEED_PASSWORD,
  });
  if (error) throw new Error(`sign in as ${player.nickname}: ${error.message}`);

  clientCache.set(player.id, supabase);
  return supabase;
}

/** An anonymous client — the view a visitor from a shared link gets. */
export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * The service-role client.
 *
 * Used ONLY to set a spec's starting state up and to read the database back
 * for an assertion — never to perform the action under test. An assertion that
 * passes because service_role could do it says nothing about whether a player
 * could.
 */
export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export { players, SEED_PASSWORD };
