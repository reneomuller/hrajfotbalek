import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Session refresh.
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
