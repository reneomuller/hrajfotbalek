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
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="font-[family-name:var(--font-anton)] text-4xl uppercase tracking-tight">
          {t.auth.loginTitle}
        </h1>
        <p className="mt-3 text-sm opacity-70">{t.auth.loginLede}</p>

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
        <p className="mt-8 border-t border-hairline pt-6 text-center text-sm text-muted">
          {t.auth.noAccountLead}{" "}
          <Link
            href={signupHref(params)}
            data-testid="login-signup-link"
            className="font-bold text-volt no-underline"
          >
            {t.auth.createAccountCta}
          </Link>
        </p>
      </div>
    </main>
  );
}
