import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types/database";

/**
 * Supabase client factories.
 *
 * Three distinct clients, three distinct trust levels:
 *
 *  - `createBrowserSupabaseClient()` — anon key, runs in the browser, fully
 *    subject to RLS.
 *  - `createServerSupabaseClient()` — anon key plus the user's session cookie,
 *    runs on the server, also fully subject to RLS. Identity comes from
 *    `auth.uid()`.
 *  - `createServiceRoleSupabaseClient()` — service-role key, bypasses RLS,
 *    server-only.
 *
 * SECURITY: the service-role key must never be exposed to the browser and must
 * never live under a `NEXT_PUBLIC_` prefix — anything so prefixed is inlined
 * into the client bundle by Next.js. The key grants *reach*, not *permission*:
 * every state transition still runs through a `SECURITY DEFINER` RPC that
 * performs its own authorization check internally. Reaching a table directly
 * with this client sidesteps that check, so don't.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const SUPABASE_URL_VAR = "NEXT_PUBLIC_SUPABASE_URL";
const SUPABASE_ANON_KEY_VAR = "NEXT_PUBLIC_SUPABASE_ANON_KEY";
const SUPABASE_SERVICE_ROLE_KEY_VAR = "SUPABASE_SERVICE_ROLE_KEY";

/** Browser client — anon key, RLS-bound. Safe to call from client components. */
export function createBrowserSupabaseClient(): SupabaseClient<Database> {
  return createBrowserClient<Database>(
    requireEnv(SUPABASE_URL_VAR),
    requireEnv(SUPABASE_ANON_KEY_VAR),
  );
}

/**
 * Server client — anon key carrying the caller's session cookie, RLS-bound.
 * Use this for anything acting *as the signed-in player*.
 */
export async function createServerSupabaseClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    requireEnv(SUPABASE_URL_VAR),
    requireEnv(SUPABASE_ANON_KEY_VAR),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Session refresh is handled by middleware instead; safe to ignore.
          }
        },
      },
    },
  );
}

/**
 * Service-role client — bypasses RLS. Server-only: cron routes, admin RPC
 * invocation, and the seed script. Never import this into a client component.
 */
export function createServiceRoleSupabaseClient(): SupabaseClient<Database> {
  if (typeof window !== "undefined") {
    throw new Error(
      "createServiceRoleSupabaseClient() was called in the browser. " +
        "The service-role key is server-only.",
    );
  }

  if (process.env[`NEXT_PUBLIC_${SUPABASE_SERVICE_ROLE_KEY_VAR}`]) {
    throw new Error(
      `NEXT_PUBLIC_${SUPABASE_SERVICE_ROLE_KEY_VAR} is set. The service-role key ` +
        "must never carry a NEXT_PUBLIC_ prefix — that inlines it into the client bundle.",
    );
  }

  const serviceRoleKey = requireEnv(SUPABASE_SERVICE_ROLE_KEY_VAR);

  if (serviceRoleKey === process.env[SUPABASE_ANON_KEY_VAR]) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is identical to the anon key — these must be distinct secrets.",
    );
  }

  return createClient<Database>(requireEnv(SUPABASE_URL_VAR), serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
