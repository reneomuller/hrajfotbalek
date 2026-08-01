import type { Metadata } from "next";
import { BookingList } from "@/components/BookingList";
import { CreditBalance } from "@/components/CreditBalance";
import { ChangeEmailForm, ChangePasswordForm } from "@/components/account/SecurityForms";
import { requireCurrentPlayer } from "@/lib/auth/session";
import { getOwnCreditBalance, listOwnBookings } from "@/lib/booking/queries";
import { getStrings } from "@/lib/i18n/server";
import { signOutAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStrings();
  return {
    title: t.account.title,
    // The account page must never be indexed or previewed.
    robots: { index: false, follow: false },
  };
}

export const dynamic = "force-dynamic";

/**
 * Account page — bookings, wallet, self-cancel, deletion request.
 *
 * Gated server-side by `requireCurrentPlayer`, and gated a second time by RLS:
 * every read below is own-row only, so even a bug in this gate could not
 * surface another player's bookings or ledger.
 */
export default async function AccountPage() {
  const t = await getStrings();
  const player = await requireCurrentPlayer("/account");

  const [bookings, balanceCzk] = await Promise.all([
    listOwnBookings(),
    getOwnCreditBalance(),
  ]);

  const deletionHref =
    `mailto:${t.account.deleteMailto}` +
    `?subject=${encodeURIComponent(t.account.deleteSubject)}` +
    `&body=${encodeURIComponent(`Player: ${player.nickname}`)}`;

  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
      <h1 className="m-0 font-display text-section-title uppercase tracking-wide text-white">
        {t.account.title}
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
            {t.auth.signOut}
          </button>
        </form>
      </div>

      <div className="mt-8">
        <CreditBalance balanceCzk={balanceCzk} />
      </div>

      <section className="mt-10">
        <h2 className="m-0 mb-4 font-condensed text-[17px] font-bold uppercase tracking-wide text-white">
          {t.account.myBookings}
        </h2>
        <BookingList rows={bookings} />
      </section>

      {/*
        Sign-in and security, above the deletion block.

        Contract §3.3 puts both controls above the delete mailto, and the order
        is the point: the two things a person can fix themselves come before the
        one thing that needs an email to a human. Someone who arrives here
        wanting out of a compromised account should meet "change your password"
        before "ask us to delete everything".
      */}
      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="m-0 font-condensed text-lg font-bold uppercase tracking-wide text-white">
          {t.account.securityTitle}
        </h2>
        <div className="mt-5 flex flex-col gap-8 sm:flex-row sm:gap-10">
          <div className="flex-1">
            <ChangePasswordForm />
          </div>
          <div className="flex-1">
            <ChangeEmailForm currentEmail={player.email} />
          </div>
        </div>
      </section>

      {/*
        Deletion is by email request only — there is deliberately no self-serve
        deletion UI. Deletion is implemented as ANONYMIZATION: the nickname
        becomes `deleted-player-<id>`, email and phone are nulled, and the row
        is retained so `events` and `credit_ledger` stay keyed to it. A hard
        delete would orphan the ledger, which is exactly what the wallet's
        integrity rests on. Phase 2 adds one thing to that list: the profile
        photo object is deleted from storage, since nulling text columns leaves
        a public image of someone who asked to be forgotten.
      */}
      <section className="mt-12 border-t border-hairline pt-6">
        <h2 className="m-0 font-mono text-[11px] uppercase tracking-eyebrow text-faint">
          {t.account.deleteAccount}
        </h2>
        <p className="mt-2 text-[13px] leading-snug text-muted">
          {t.account.deleteAccountHint}
        </p>
        <a
          href={deletionHref}
          data-testid="deletion-mailto"
          className="mt-3 inline-block font-mono text-[12px] text-volt no-underline"
        >
          {t.account.deleteMailto}
        </a>
      </section>
    </main>
  );
}
