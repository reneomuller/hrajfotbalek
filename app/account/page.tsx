import type { Metadata } from "next";
import { ToastFromQuery } from "@/components/ToastFromQuery";
import Link from "next/link";
import { PlayerHistory } from "@/components/account/PlayerHistory";
import { splitHistory } from "@/lib/booking/history";
import { CreditBalance } from "@/components/CreditBalance";
import { CreditBatches } from "@/components/account/CreditBatches";
import { ChangeEmailForm, ChangePasswordForm } from "@/components/account/SecurityForms";
import { PhotoUpload } from "@/components/account/PhotoUpload";
import { avatarUrl } from "@/lib/storage/avatar";
import { initials } from "@/lib/roster/initials";
import { requireCurrentPlayer } from "@/lib/auth/session";
import { getOwnCreditBalance, listOwnBookings } from "@/lib/booking/queries";
import { listMyBatches } from "@/lib/pass/queries";
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
export default async function AccountPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getStrings();
  const query = searchParams ? await searchParams : {};
  const player = await requireCurrentPlayer("/account");

  const [bookings, balanceCzk, batches] = await Promise.all([
    listOwnBookings(),
    getOwnCreditBalance(),
    // The wallet broken into batches (§4.2). A single number cannot say that
    // 750 of a 900 balance runs out on the 3rd, which is the one thing a pass
    // holder needs in order to use it.
    listMyBatches(),
  ]);

  const photoUrl = avatarUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    player.photo_path,
    player.created_at,
  );

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

      {/*
        Profile photo.

        The initials avatar stays the fallback and is what most players will
        keep — Phase 2 adds an option, not an expectation, so the absent case is
        the ordinary one and is rendered as a first-class state rather than an
        empty frame.
      */}
      <section className="mt-8 flex items-center gap-5">
        <span
          data-testid="account-avatar"
          className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-hairline-volt bg-surface font-condensed text-2xl font-extrabold text-volt"
        >
          {photoUrl ? (
            /* A Supabase storage URL on a public bucket, rendered at 80px.
               next/image would proxy it through the optimizer for no benefit
               and add a billable transform per avatar. */
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initials(player.nickname)
          )}
        </span>
        <div className="flex flex-col gap-2">
          <h2 className="m-0 font-condensed text-base font-bold uppercase tracking-wide text-white">
            {t.account.photoTitle}
          </h2>
          <PhotoUpload hasPhoto={Boolean(player.photo_path)} />
        </div>
      </section>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <CreditBalance balanceCzk={balanceCzk} />
        <CreditBatches batches={batches} />
        {/* The entry point sits ON the wallet, because "top up" is a thought
            someone has while looking at a balance, not while reading a menu. */}
        <Link
          href="/account/topup"
          data-testid="topup-cta"
          className="rounded-control border border-hairline-volt px-4 py-2 font-condensed text-[13px] font-bold uppercase tracking-wide text-volt no-underline transition hover:bg-volt/10"
        >
          {t.account.topupCta}
        </Link>
      </div>

      <PlayerHistory history={splitHistory(bookings)} />

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
        becomes `deleted-<8 hex>` (the 20-character nickname CHECK rejects
        anything longer), email and phone are nulled, and the row
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

      {/* Signed in, or a cancellation made from this page. */}
      <ToastFromQuery query={query} />
    </main>
  );
}
