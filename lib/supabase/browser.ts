import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * The browser client, in a module a browser can actually import.
 *
 * `lib/supabase/clients.ts` holds all three factories together, which reads
 * well and cannot be imported from a client component: it pulls in
 * `next/headers` at the top level for the server client, and that has no
 * browser build. The bundler's complaint names the client component, not the
 * import three levels down, so the cause is worth stating where it will be
 * read.
 *
 * `scripts/seed.ts` already hit the same wall from the other side — it builds
 * its own client rather than importing that module, for exactly this reason.
 * This is the browser's version of that workaround, and the only file a client
 * component should import a Supabase client from.
 *
 * Same client as `createBrowserSupabaseClient()` in the shared module: anon
 * key, fully RLS-bound, no elevated reach of any kind.
 */
export function createBrowserSupabaseClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // These are NEXT_PUBLIC_, so they are inlined at build time — a miss here
    // is a build configuration problem, not a runtime one, and saying so beats
    // "supabaseUrl is required" from inside the library.
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set at build time.",
    );
  }

  return createBrowserClient<Database>(url, anonKey);
}
