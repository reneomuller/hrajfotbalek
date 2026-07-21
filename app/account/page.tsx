import type { Metadata } from "next";
import { BookingList } from "@/components/BookingList";
import { CreditBalance } from "@/components/CreditBalance";
import { requireCurrentPlayer } from "@/lib/auth/session";
import { getOwnCreditBalance, listOwnBookings } from "@/lib/booking/queries";
import { strings } from "@/lib/strings";
import { signOutAction } from "./actions";

export const metadata: Metadata = {
  title: strings.account.title,
  // The account page must never be indexed or previewed.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Account page — bookings, wallet, self-cancel, deletion request.
 *
 * Gated server-side by `requireCurrentPlayer`, and gated a second time by RLS:
 * every read below is own-row only, so even a bug in this gate could not
 * surface another player's bookings or ledger.
 */
export default async function AccountPage() {
  const player = await requireCurrentPlayer("/account");

  const [bookings, balanceCzk] = await Promise.all([
    listOwnBookings(),
    getOwnCreditBalance(),
  ]);

  const deletionHref =
    `mailto:${strings.account.deleteMailto}` +
    `?subject=${encodeURIComponent(strings.account.deleteSubject)}` +
    `&body=${encodeURIComponent(`Player: ${player.nickname}`)}`;

  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
      <h1 className="m-0 font-display text-section-title uppercase tracking-wide text-white">
        {strings.account.title}
      </h1>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 font-mono text-[12px] tracking-[1px] text-muted">
          {player.nickname}
        </p>

        {/* Sign out — a server action, so the session cookies are cleared
            server-side rather than merely navigated away from. */}
        <form action={signOutAction}>
          <button
            type="submit"
            data-testid="sign-out"
            className="rounded-control border border-hairline-link px-[14px] py-2 font-condensed text-[13px] font-bold uppercase tracking-wide text-bone transition hover:border-volt hover:text-volt"
          >
            {strings.auth.signOut}
          </button>
        </form>
      </div>

      <div className="mt-8">
        <CreditBalance balanceCzk={balanceCzk} />
      </div>

      <section className="mt-10">
        <h2 className="m-0 mb-4 font-condensed text-[17px] font-bold uppercase tracking-wide text-white">
          {strings.account.myBookings}
        </h2>
        <BookingList rows={bookings} />
      </section>

      {/*
        Deletion is by email request only — there is deliberately no self-serve
        deletion UI. Deletion is implemented as ANONYMIZATION: the nickname
        becomes `deleted-player-<id>`, email and phone are nulled, and the row
        is retained so `events` and `credit_ledger` stay keyed to it. A hard
        delete would orphan the ledger, which is exactly what the wallet's
        integrity rests on.
      */}
      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="m-0 font-mono text-[11px] uppercase tracking-eyebrow text-faint">
          {strings.account.deleteAccount}
        </h2>
        <p className="mt-2 text-[13px] leading-snug text-muted">
          {strings.account.deleteAccountHint}
        </p>
        <a
          href={deletionHref}
          data-testid="deletion-mailto"
          className="mt-3 inline-block font-mono text-[12px] text-volt no-underline"
        >
          {strings.account.deleteMailto}
        </a>
      </section>
    </main>
  );
}
