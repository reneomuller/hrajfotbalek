import type { Metadata } from "next";
import { ToastFromQuery } from "@/components/ToastFromQuery";
import Link from "next/link";
import { CreditBalance } from "@/components/CreditBalance";
import { CreditBatches } from "@/components/account/CreditBatches";
import { SecurityLinks } from "@/components/account/SecurityLinks";
import { PhotoUpload } from "@/components/account/PhotoUpload";
import { avatarUrl } from "@/lib/storage/avatar";
import { initials } from "@/lib/roster/initials";
import { requireCurrentPlayer } from "@/lib/auth/session";
import { getOwnCreditBalance } from "@/lib/booking/queries";
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
 * Account page — who you are, your wallet, and the three account controls.
 *
 * NO LONGER THE FIXTURE LIST (v1.2 §7): that is `/my-games`, with its own tab.
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

  const [balanceCzk, batches] = await Promise.all([
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
      <div className="mt-2 flex flex-wrap items-center justify-end gap-3">
        {/* The nickname used to sit here too. It now leads the avatar block
            below, at a size that reads as an identity rather than as a caption
            — and saying it twice on one screen was the page telling the reader
            nothing twice. */}

        {/* Sign out — a server action, so the session cookies are cleared
            server-side rather than merely navigated away from. */}
        <form action={signOutAction}>
          <button
            type="submit"
            data-testid="sign-out"
            className="rounded-control border border-hairline-strong px-[14px] py-2 font-condensed text-[13px] font-bold uppercase tracking-wide text-bone transition hover:border-volt hover:text-volt"
          >
            {t.auth.signOut}
          </button>
        </form>
      </div>

      {/*
        Profile photo — AT THE TOP, WITH THE EDIT AFFORDANCE ON THE AVATAR.

        The upload was mounted here before but read as a caption under a
        heading: a reviewer looking for "where do I change my picture" did not
        find it. The avatar itself is now the control, with a visible edit
        badge on it, which is the shape every product this competes with uses.

        The initials avatar stays the fallback and is what most players will
        keep — Phase 2 added an option, not an expectation, so the absent case
        is the ordinary one and is rendered as a first-class state rather than
        an empty frame.
      */}
      <section className="mt-8 flex items-center gap-5">
        <PhotoUpload hasPhoto={Boolean(player.photo_path)}>
        <span
          data-testid="account-avatar"
          className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-volt bg-surface font-condensed text-2xl font-extrabold text-volt"
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
        </PhotoUpload>

        <div className="flex flex-col gap-1">
          <span
            data-testid="account-nickname"
            className="font-condensed text-[22px] font-bold leading-tight text-white"
          >
            {player.nickname}
          </span>
          <span className="font-mono text-[11px] text-muted">{t.account.photoHint}</span>
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

      {/*
        THE FIXTURE LIST MOVED TO `/my-games` (v1.2 §7). It was the single
        most-visited thing on this page and it sat three-quarters of the way
        down, behind a photo upload and a wallet, on a page named after
        administration. It has its own route and its own tab now; this is the
        way there for anyone who still comes looking here.
      */}
      <Link
        href="/my-games"
        data-testid="my-games-link"
        className="mt-8 block font-condensed text-[15px] font-bold uppercase tracking-wide text-volt no-underline"
      >
        {t.account.myGamesLink}
      </Link>

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
      {/*
        THREE LINKS, ONE STACK, ALL THE SAME WEIGHT (§3.3, REQ-AUTH-020).

        Change password, change email, delete account — in that order, because
        the two things a person can fix themselves come before the one that
        needs an email to a human. Someone arriving here wanting out of a
        compromised account should meet "change your password" before "ask us
        to delete everything".

        No heading, no card, no columns. The two-column panel this replaces is
        a recorded defect: these are controls used roughly once each, and they
        were given more vertical space than the wallet and the fixture list.
        Small, grey, and identical to each other is the entire design.
      */}
      <section
        data-testid="account-security"
        className="mt-12 border-t border-hairline pt-6"
      >
        <SecurityLinks />
        <a
          href={deletionHref}
          data-testid="deletion-mailto"
          className="block py-2 font-mono text-[12px] text-muted no-underline transition hover:text-bone"
        >
          {t.account.deleteAccount}
        </a>
      </section>

      {/* Signed in, or a cancellation made from this page. */}
      <ToastFromQuery query={query} />
    </main>
  );
}
