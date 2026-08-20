"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { useStrings } from "@/components/LocaleProvider";

/**
 * "Continue with Google" (round 7, item 1) — `p08` and `p09`.
 *
 * GATED BY `NEXT_PUBLIC_GOOGLE_AUTH`, and the gate is the point. Google
 * sign-in needs three things done in three dashboards — a Google Cloud OAuth
 * client, the Supabase provider, and the Vercel environment — and until all
 * three agree the button is a control that takes someone to an error page.
 * Round 5 omitted it entirely for exactly that reason (ruling R15). This is the
 * same ruling honoured differently: the code ships, the control does not appear
 * until the flag says the dashboards are done.
 *
 * The flag is read at MODULE level rather than in the component because
 * `NEXT_PUBLIC_*` is inlined at build time — there is no runtime read to do,
 * and putting it in a hook would imply it can change without a deploy.
 *
 * IT REUSES THE MAGIC-LINK CALLBACK, which is why this round is small. OAuth
 * returns a PKCE `code`, the shape `/auth/callback` has handled since Phase 1:
 * it exchanges the code, runs `completePostAuth` (funnel event and shadow
 * claim), and `destinationAfterAuth` sends a session with no player row to
 * `/signup`. A first-time Google user therefore lands on the finish-profile
 * form with their session already established, which is the existing path for
 * anyone arriving credential-first. `complete_signup_v2` never asks how the
 * session was obtained.
 *
 * THE PKCE COOKIE PROBLEM DOES NOT APPLY HERE. CLAUDE.md's warning is about
 * mail apps opening a link in an embedded browser with its own cookie jar; an
 * OAuth round trip starts and finishes in the same browser, so the verifier is
 * where the exchange expects it.
 *
 * THE INTENT SURVIVES. `game`, `action` and `next` are appended to
 * `redirectTo` exactly as the magic link appends them, so tapping "Claim your
 * spot" while signed out and choosing Google still lands on that game.
 */

/** Build-time inline. See the note above. */
const ENABLED = process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1";

/**
 * The Google "G", inline.
 *
 * NOT A FILE IN `public/brand/` like the WhatsApp and Instagram marks: those
 * were supplied by the owner, and Google's mark has usage terms that make
 * "draw something G-shaped" the wrong move. These are Google's own published
 * path data at their published colours, which is what their sign-in branding
 * guidance distributes.
 */
function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="h-5 w-5 shrink-0">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

export function GoogleAuthButton({
  label,
  gameId = null,
  action = "login",
  next = null,
}: {
  /** `Continue with Google` on sign-in, `Sign up with Google` on signup. */
  label: string;
  gameId?: string | null;
  action?: string;
  next?: string | null;
}) {
  const t = useStrings();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!ENABLED) return null;

  const start = async () => {
    setPending(true);
    setFailed(false);

    /*
     * The origin comes from the BROWSER, not from `NEXT_PUBLIC_SITE_URL`.
     *
     * Supabase's redirect allow-list fails SILENTLY — an unlisted `redirectTo`
     * does not error, it redirects to the project Site URL instead, where
     * nothing exchanges the credential and the person ends up authenticated at
     * the auth server holding no session cookie. Using the live origin means
     * the value is wherever they actually are, so the allow-list entry and the
     * request cannot disagree because of a stale environment variable. Both
     * must still be right; this removes one of the two ways to be wrong.
     */
    const redirect = new URL("/auth/callback", window.location.origin);
    if (gameId) redirect.searchParams.set("game", gameId);
    if (action) redirect.searchParams.set("action", action);
    if (next) redirect.searchParams.set("next", next);

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirect.toString() },
    });

    // Reached only if the redirect never started. A successful call navigates
    // away and nothing below runs.
    if (error) {
      setPending(false);
      setFailed(true);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={start}
        disabled={pending}
        data-testid="google-auth"
        /*
         * WHITE — the one control in this product that is not on the palette.
         * Both frames draw it that way, and Google's terms require their mark
         * on white or on their own blue. A volt Google button is not a choice
         * we get to make.
         */
        className="flex min-h-11 w-full items-center justify-center gap-3 rounded-pill bg-white px-4 py-3 text-cta font-bold text-ink no-underline transition disabled:opacity-50"
      >
        <GoogleMark />
        {pending ? t.common.loading : label}
      </button>
      {failed && (
        <p role="alert" data-testid="google-auth-error" className="m-0 text-small text-danger">
          {t.auth.googleFailed}
        </p>
      )}
    </div>
  );
}
