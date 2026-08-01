import type { Metadata } from "next";
import Link from "next/link";
import { TopupForm } from "@/components/account/TopupForm";
import { requireCurrentPlayer } from "@/lib/auth/session";
import { getStrings } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStrings();
  return { title: t.account.topupTitle, robots: { index: false, follow: false } };
}

export const dynamic = "force-dynamic";

/** `/account/topup` — choose an amount. The VS is minted by the RPC, not here. */
export default async function TopupPage() {
  const t = await getStrings();
  await requireCurrentPlayer("/account/topup");

  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
      <h1 className="m-0 font-display text-section-title uppercase tracking-wide text-white">
        {t.account.topupTitle}
      </h1>
      <p className="mt-2 max-w-prose text-sm text-white/70">{t.account.topupLede}</p>

      <div className="max-w-sm">
        <TopupForm />
      </div>

      <Link
        href="/account"
        className="mt-8 inline-block text-sm text-white/60 underline underline-offset-4"
      >
        {t.account.topupBackToAccount}
      </Link>
    </main>
  );
}
