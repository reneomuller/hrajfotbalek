import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Query params that carry a magic-link credential worth rescuing. */
const CREDENTIAL_PARAMS = ["code", "token_hash"] as const;

const AUTH_CALLBACK_PATH = "/auth/callback";

/**
 * Session refresh, plus rescuing a misdirected magic link.
 *
 * Server Components cannot write cookies, so a session that needs refreshing
 * would otherwise expire mid-visit and silently sign the user out. This runs
 * before them and can set cookies, so the refresh happens here.
 *
 * Named `proxy.ts` rather than `middleware.ts`: Next.js 16 renamed the
 * convention and warns on the old filename.
 *
 * `getUser()` is called deliberately rather than `getSession()`: it revalidates
 * against the auth server, which is both what triggers the refresh and what
 * makes the result trustworthy. Do not "optimise" it to getSession().
 */
export default async function proxy(request: NextRequest) {
  const url = new URL(request.url);

  /*
   * Supabase validates `emailRedirectTo` against the project's redirect
   * allow-list and, on a miss, SILENTLY falls back to the project Site URL
   * rather than erroring. The credential still arrives — just on whatever page
   * the Site URL points at, where nothing exchanges it. The user ends up
   * authenticated at the auth server while holding no session cookie, so every
   * gated route bounces them to /login and signup can never complete.
   *
   * Forwarding the credential to the callback makes the flow survive that,
   * which matters because the mismatch is the normal state of affairs when
   * testing from a phone: the origin is then a LAN address or a fresh tunnel
   * URL that nobody has allow-listed yet.
   */
  if (
    url.pathname !== AUTH_CALLBACK_PATH &&
    CREDENTIAL_PARAMS.some((p) => url.searchParams.has(p))
  ) {
    const callback = new URL(AUTH_CALLBACK_PATH, url.origin);
    url.searchParams.forEach((value, key) => callback.searchParams.set(key, value));

    // Resume where the link dropped them, unless it already carries an intent
    // or the drop point was the landing page — never a useful destination for
    // someone mid-signup.
    if (!callback.searchParams.has("next") && url.pathname !== "/") {
      callback.searchParams.set("next", url.pathname);
    }

    return NextResponse.redirect(callback);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and image optimisation.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
