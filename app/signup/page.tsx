import { redirect } from "next/navigation";
import { SignupForm } from "./SignupForm";
import { getSessionUser, getCurrentPlayer } from "@/lib/auth/session";
import { strings } from "@/lib/strings";

export const metadata = { title: strings.auth.signupTitle };

/**
 * `/signup` — nickname + consent for a session that has no player row yet.
 *
 * Gated server-side. Reaching this page without a session means the magic-link
 * round-trip has not happened, and an already-complete player has nothing to do
 * here, so both are redirected away rather than shown a form that cannot work.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next && params.next.startsWith("/") ? params.next : "/games";

  const user = await getSessionUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const existing = await getCurrentPlayer();
  if (existing) {
    redirect(next);
  }

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="font-[family-name:var(--font-anton)] text-4xl uppercase tracking-tight">
          {strings.auth.signupTitle}
        </h1>
        <p className="mt-3 text-sm opacity-70">{strings.auth.signupLede}</p>

        <SignupForm next={next} />
      </div>
    </main>
  );
}
