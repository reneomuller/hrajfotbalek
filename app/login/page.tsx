import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./LoginForm";
import { getStrings } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStrings();
  return { title: t.auth.loginTitle };
}

/**
 * `/login`.
 *
 * The game id and pending action arrive as query params from the Book /
 * Join-waitlist buttons and are forwarded into the magic link's redirectTo, so
 * the intent survives the round-trip through the user's inbox.
 */
/** Carries the deep-link intent across the login → signup hop. */
function signupHref(params: { game?: string; action?: string; next?: string }): string {
  const query = new URLSearchParams();
  if (params.game) query.set("game", params.game);
  if (params.action) query.set("action", params.action);
  if (params.next) query.set("next", params.next);
  const suffix = query.toString();
  return suffix ? `/signup?${suffix}` : "/signup";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string; action?: string; next?: string }>;
}) {
  const t = await getStrings();
  const params = await searchParams;

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
          {t.auth.loginTitle}
        </h1>
        <p className="mt-3 text-body text-muted">{t.auth.loginLede}</p>

        <LoginForm
          gameId={params.game ?? null}
          action={params.action ?? "login"}
          next={params.next ?? null}
        />

        {/*
          THE CREATE-ACCOUNT PATH (§3.1a, v1.1.4).

          The header carries one door now, so this is the only place a
          signed-out visitor is offered signup — and it is the right place:
          someone with no account is already on the login page trying to work
          out why their email is not recognised.

          The query is FORWARDED, not dropped. Tapping "Claim your spot" while
          signed out lands here with the game and the intent attached; losing
          them at this hop would send someone through signup and then to the
          home page, having forgotten the game they came for.
        */}
        {/*
          ITS OWN CARD, WITH A VOLT EYEBROW AND AN OUTLINED CONTROL (p08).

          It was a centred sentence under a rule with the destination as an
          inline link — the weakest affordance on a page whose whole job, for
          a first-time visitor, is this one. p08 gives it a panel of its own,
          a volt tracked-caps eyebrow, and a full-width outlined capsule.

          THE COPY DOES NOT MOVE. p08's wording is "New here? Create an
          account" over "Sign up with email →"; `noAccountLead` and
          `createAccountCta` say the same two things and are already reviewed
          in Czech and Russian. Restyling reviewed copy is free; rewriting it
          is three translations and a copy decision that is not this round's.

          GOOGLE IS OMITTED, AND DELIBERATELY. p08 draws `Continue with
          Google` and `Sign up with Google` on this screen. There is no Google
          OAuth in the product — the audit files it as a proposed feature
          round — and a button that cannot sign anyone in is the dead
          affordance the night run's own rule forbids. It lands with the
          capability, not before it.
        */}
        <div className="lifted mt-4 rounded-card p-5">
          <p className="m-0 text-eyebrow font-semibold uppercase text-volt">
            {t.auth.noAccountLead}
          </p>
          <Link
            href={signupHref(params)}
            data-testid="login-signup-link"
            className="mt-3 flex min-h-11 items-center justify-center rounded-pill border-2 border-hairline-strong px-4 py-3 text-cta font-bold text-bone no-underline transition-colors hover:border-hairline-volt"
          >
            {t.auth.createAccountCta}
          </Link>
        </div>
      </div>
    </main>
  );
}
