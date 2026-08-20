import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignupForm } from "./SignupForm";
import { GoogleAuthBlock } from "@/components/auth/GoogleAuthBlock";
import { writeProfileFromMetadata } from "./actions";
import { getSessionUser, getCurrentPlayer } from "@/lib/auth/session";
import { getLocale, getStrings } from "@/lib/i18n/server";
import { countryOptions } from "@/lib/auth/countries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStrings();
  return { title: t.auth.signupTitle };
}

/**
 * `/signup` — three states, decided server-side.
 *
 *   no session          → the account form. This is the new front door, and
 *                         unlike Phase 1 it is reachable signed out.
 *   session, no player  → finish the profile. Reached after verification, and
 *                         also by anyone who arrives credential-first: an OTP
 *                         login, or a shadow player claiming an identity. The
 *                         metadata written at signup is tried first, so the
 *                         common case completes without showing a form at all.
 *   session and player  → nothing to do here; go where you were going.
 *
 * The middle state is the one that matters. It is what a half-finished signup
 * looks like, and `destinationAfterAuth()` has always routed to it — so the
 * inverted flow inherits a recovery path rather than needing a new one.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const t = await getStrings();
  const locale = await getLocale();
  const params = await searchParams;
  const next = params.next && params.next.startsWith("/") ? params.next : "/games";

  const user = await getSessionUser();
  const existing = user ? await getCurrentPlayer() : null;
  if (existing) redirect(next);

  const countries = countryOptions(locale);

  if (!user) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <h1 className="m-0 font-display text-page-title uppercase tracking-wide text-white">
            {t.auth.signupTitle}
          </h1>
          <p className="mt-3 text-body text-muted">{t.auth.signupLede}</p>

          {/* p09. Gated identically to /login — see GoogleAuthBlock. */}
          <GoogleAuthBlock
            label={t.auth.googleSignUp}
            orLabel={t.auth.authOr}
            action="signup"
            next={next}
          />

          <SignupForm next={next} countries={countries} mode="create" />

          {/* The way back, in the same volt-link idiom the rest of the
              product uses for a secondary destination. */}
          <p className="mt-6 text-center text-body text-muted">
            {t.auth.haveAccount}{" "}
            <Link
              href={`/login?next=${encodeURIComponent(next)}`}
              className="font-bold text-volt no-underline"
            >
              {t.auth.loginTitle}
            </Link>
          </p>
        </div>
      </main>
    );
  }

  /*
   * A session with no player row. Try the metadata left at signup first: in the
   * ordinary case the profile is already known and the player never sees this
   * page — they verify their email and land where they were going.
   *
   * `writeProfileFromMetadata()` returns rather than throws for every failure,
   * so anything it cannot complete falls through to the form below: a nickname
   * taken while the mail sat unread, a bag from an older build, or a session
   * that predates this flow entirely.
   */
  const written = await writeProfileFromMetadata();
  if (written.ok) redirect(next);

  return (
    /*
      THE PAGE SHELL IS THE PRODUCT'S, NOT THE FORM'S (redesign v2, round 5).

      It was `flex items-center justify-center px-6 py-16` around a `max-w-sm`
      column — a vertically centred card, which is a login screen from a
      different app. p08 and p09 draw the title top-left under the header, on
      the same gutter and the same measure as every other page, and let the
      content run down the page. `pt-24` and `px-gutter` are what `/games` and
      the game detail use.
    */
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
      <div className="w-full">
        <h1 className="m-0 font-display text-page-title uppercase tracking-wide text-white">
          {t.auth.signupFinishTitle}
        </h1>
        <p className="mt-3 text-body text-muted">{t.auth.signupFinishLede}</p>

        {written.message ? (
          <p role="alert" className="mt-4 text-sm text-red-400">
            {written.message}
          </p>
        ) : null}

        <SignupForm next={next} countries={countries} mode="finish" />
      </div>
    </main>
  );
}
