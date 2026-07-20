import { strings } from "@/lib/strings";

export const metadata = { title: strings.auth.callbackErrorTitle };

/**
 * Terminal state for a magic link that could not be exchanged.
 *
 * This page exists because the previous behaviour — redirect to /login on any
 * exchange failure — was indistinguishable from "not signed in yet". /login
 * never rendered the `?error=` it was handed, so a broken link and a fresh
 * visit looked identical, and the signup gate failed for a week with nothing
 * on screen and nothing in the logs to say why.
 *
 * The underlying reason is shown deliberately. "Link expired", "already used"
 * and "opened in a different browser than the one that requested it" are the
 * same sentence to a user but completely different fixes, and hiding which one
 * happened is what made this expensive to diagnose.
 */
export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; detail?: string }>;
}) {
  const { reason, detail } = await searchParams;

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="font-[family-name:var(--font-anton)] text-4xl uppercase tracking-tight">
          {strings.auth.callbackErrorTitle}
        </h1>
        <p className="mt-3 text-sm opacity-70" role="alert">
          {strings.auth.callbackFailed}
        </p>

        {(reason || detail) && (
          <div className="mt-6 rounded border border-white/20 p-4">
            <div className="font-[family-name:var(--font-jetbrains-mono)] text-xs uppercase tracking-widest opacity-60">
              {strings.auth.callbackDetailLabel}
            </div>
            <p className="mt-2 break-words font-[family-name:var(--font-jetbrains-mono)] text-xs opacity-80">
              {[reason, detail].filter(Boolean).join(" — ")}
            </p>
          </div>
        )}

        <a
          href="/login"
          className="mt-8 inline-block rounded bg-[var(--color-volt)] px-4 py-3 font-[family-name:var(--font-barlow-condensed)] text-lg font-extrabold uppercase italic tracking-wide text-black"
        >
          {strings.auth.callbackRetry}
        </a>
      </div>
    </main>
  );
}
