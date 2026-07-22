import type { Metadata } from "next";
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
      </div>
    </main>
  );
}
