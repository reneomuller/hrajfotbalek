import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SetPasswordForm } from "./SetPasswordForm";
import { getSessionUser } from "@/lib/auth/session";
import { getStrings } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStrings();
  return { title: t.auth.setPasswordTitle };
}

/**
 * `/login/set-password` — where a passwordless account stops being one.
 *
 * Reached straight after a code sign-in (contract §3.2). Every account created
 * before Phase 2 arrives here exactly once: the code is how they get in, and
 * this is the step that means they will not need it again.
 *
 * IT IS A PAGE, NOT A GATE. The session is established before the redirect that
 * lands here, so nothing about this screen is load-bearing for access — a
 * player who closes the tab is signed in. R1 is "no existing player is locked
 * out", and a migration step that could fail closed would be the thing most
 * likely to violate it.
 *
 * A visitor with no session has nothing to set a password on, so they go to
 * `/login` rather than being shown a form that cannot work.
 */
export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const t = await getStrings();
  const params = await searchParams;
  const next = params.next && params.next.startsWith("/") ? params.next : "/games";

  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="font-[family-name:var(--font-anton)] text-4xl uppercase tracking-tight">
          {t.auth.setPasswordTitle}
        </h1>
        <p className="mt-3 text-sm opacity-70">{t.auth.setPasswordLede}</p>

        <SetPasswordForm next={next} />
      </div>
    </main>
  );
}
