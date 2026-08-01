import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QrPayment } from "@/components/QrPayment";
import { requireCurrentPlayer } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/clients";
import { paymentIban } from "@/lib/payments/spd";
import { getStrings } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStrings();
  return { title: t.account.topupTitle, robots: { index: false, follow: false } };
}

export const dynamic = "force-dynamic";

/**
 * `/account/topup/[id]` — the QR for one top-up.
 *
 * The row is read through the OWNER'S session, not the service role, so RLS is
 * what decides whether this page can show anything: another player's top-up id
 * returns no row and 404s, without this page having to check ownership itself.
 *
 * Same `QrPayment` component the booking flow uses. The SPD string differs only
 * in its variable symbol — a 27-series one — which is the entire mechanism by
 * which a bank statement tells a wallet top-up from a Tuesday game.
 */
export default async function TopupQrPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getStrings();
  const player = await requireCurrentPlayer("/account");
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: topup } = await supabase
    .from("credit_topups")
    .select("id, amount_czk, payment_code, status")
    .eq("id", id)
    .maybeSingle();

  if (!topup) notFound();

  const confirmed = topup.status !== "pending";

  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
      <h1 className="m-0 font-display text-section-title uppercase tracking-wide text-white">
        {confirmed ? t.account.topupConfirmedTitle : t.account.topupPendingTitle}
      </h1>

      {confirmed ? null : (
        <>
          <p className="mt-2 max-w-prose text-sm text-white/70">
            {t.account.topupPendingBody}
          </p>

          <div className="mt-8 max-w-sm">
            <QrPayment
              iban={paymentIban()}
              amountCzk={topup.amount_czk}
              variableSymbol={topup.payment_code}
              nickname={player.nickname}
            />
          </div>
        </>
      )}

      <Link
        href="/account"
        className="mt-8 inline-block text-sm text-white/60 underline underline-offset-4"
      >
        {t.account.topupBackToAccount}
      </Link>
    </main>
  );
}
