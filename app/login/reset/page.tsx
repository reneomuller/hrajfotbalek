import type { Metadata } from "next";
import Link from "next/link";
import { ResetRequestForm } from "./ResetRequestForm";
import { getStrings } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStrings();
  return { title: t.auth.resetTitle, robots: { index: false, follow: false } };
}

/**
 * `/login/reset` — the reset-request page (round 9, item 8).
 *
 * IT IS THE EXISTING FLOW, MOVED. `requestMagicLink` sends one email carrying
 * both a link and a six-digit code, and `verifyEmailOtp` accepts the code.
 * Nothing about that changed; what changed is that it has a page instead of
 * sitting permanently open as a second card under the sign-in form, where it
 * gave a path most people never take the same weight as the one they came for
 * and put two email boxes on one screen.
 *
 * THE PAGE SHELL IS THE PRODUCT'S. An earlier instruction kept the reset
 * surfaces in the old style — "leave them functional, do not invent a design"
 * — because no frame exists for them. That instruction is lifted, and there is
 * still no frame, so nothing here is invented either: it is the same shell,
 * the same `page-title` step and the same `.lifted` panels every other page
 * uses.
 *
 * THE BOOKING INTENT SURVIVES THIS HOP, exactly as it survives the login →
 * signup hop. Tapping "Claim your spot" while signed out, failing a password
 * and recovering should still land on the game you came for.
 */
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string; action?: string; next?: string }>;
}) {
  const t = await getStrings();
  const params = await searchParams;

  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
      <div className="w-full">
        <h1 className="m-0 font-display text-page-title uppercase tracking-wide text-white">
          {t.auth.resetTitle}
        </h1>
        <p className="mt-3 text-body text-muted">{t.auth.resetLede}</p>

        <ResetRequestForm
          gameId={params.game ?? null}
          action={params.action ?? "login"}
          next={params.next ?? null}
        />

        <p className="mt-6 text-center text-body text-muted">
          <Link
            href="/login"
            data-testid="reset-back-to-login"
            className="font-bold text-volt no-underline"
          >
            {t.auth.resetBackToLogin}
          </Link>
        </p>
      </div>
    </main>
  );
}
