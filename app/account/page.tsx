import type { Metadata } from "next";
import Link from "next/link";
import { ToastFromQuery } from "@/components/ToastFromQuery";
import { BadgeGrid } from "@/components/account/BadgeGrid";
import { CreditBalance } from "@/components/CreditBalance";
import { CreditBatches } from "@/components/account/CreditBatches";
import { PlayerHistory } from "@/components/account/PlayerHistory";
import { ProfileDetails } from "@/components/account/ProfileDetails";
import { ProfileCover } from "@/components/account/ProfileCover";
import { ProfileIdentity } from "@/components/account/ProfileIdentity";
import { ProfileStats } from "@/components/account/ProfileStats";
import { ProfileTabs, parseProfileTab } from "@/components/account/ProfileTabs";
import { SecurityLinks } from "@/components/account/SecurityLinks";
import { countryName, countryOptions } from "@/lib/auth/countries";
import { requireCurrentPlayer } from "@/lib/auth/session";
import { splitHistory } from "@/lib/booking/history";
import { getOwnCreditBalance, listOwnBookings } from "@/lib/booking/queries";
import { getLocale, getStrings } from "@/lib/i18n/server";
import { listMyBatches } from "@/lib/pass/queries";
import { playerBadges } from "@/lib/profile/badges";
import { profileStats } from "@/lib/profile/stats";
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
 * The profile — rebuilt against the reference screen (visibility round, item 3).
 *
 * WHAT IT WAS: a heading, a sign-out button, an avatar, an edit block, a
 * wallet, two links and a security stack, in one column, in that order. Every
 * fact the product knows about a player was present and none of it was
 * arranged — the page read as a settings screen that happened to have a face
 * at the top.
 *
 * WHAT IT IS: identity, then the three numbers, then three tabs.
 *
 *   cover + avatar + name + meta       always
 *   games played · hours · pitches     always
 *   ─────────────────────────────────
 *   Overview    wallet, then badges
 *   My games    the fixture list, the same component `/my-games` renders
 *   Settings    the edit fields, then the account controls
 *
 * THE IDENTITY AND THE STATS SIT ABOVE THE TABS, which is the reference's
 * composition and is the reason it works: who you are does not change when you
 * switch tabs, so putting it inside one of them would make it disappear on the
 * other two.
 *
 * HOW THE OWNER'S MAPPING LANDED, since it admits two readings and this is the
 * one taken. "Settings = the edit fields + account actions" puts
 * `ProfileDetails` — which IS the edit fields, display half and all — under
 * Settings rather than Overview, and leaves Overview holding the wallet and the
 * badges. The "display info" half of "Overview = display info + stats" is the
 * identity block and the stat row, which render above every tab.
 *
 * WHAT WAS SKIPPED, per the ruling: the reference's "Next milestone" progress
 * bar. Not this round.
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
  const tab = parseProfileTab(query.tab);
  const player = await requireCurrentPlayer("/account");
  // Read off the row already loaded rather than through `isAdminSession()`,
  // which would be a second round trip for a boolean this page is holding.
  const isAdmin = player.is_admin === true;
  // The country list is named and sorted in the reader's language.
  const locale = await getLocale();

  /*
   * `listOwnBookings` IS FETCHED ON EVERY TAB, and that is not waste: the stat
   * row and the badge grid are both folds over it, and both render above or
   * inside the overview. The My games tab reuses the same rows rather than
   * asking again.
   *
   * The wallet reads are the two that are genuinely tab-specific, and they are
   * cheap enough not to be worth branching a `Promise.all` around.
   */
  const [balanceCzk, batches, bookings] = await Promise.all([
    getOwnCreditBalance(),
    // The wallet broken into batches (§4.2). A single number cannot say that
    // 750 of a 900 balance runs out on the 3rd, which is the one thing a pass
    // holder needs in order to use it.
    listMyBatches(),
    listOwnBookings(),
  ]);

  const stats = profileStats(bookings);
  const badges = playerBadges(stats, t);
  const history = splitHistory(bookings);

  const deletionHref =
    `mailto:${t.account.deleteMailto}` +
    `?subject=${encodeURIComponent(t.account.deleteSubject)}` +
    `&body=${encodeURIComponent(`Player: ${player.nickname}`)}`;

  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
{/*
        THE COVER SPANS IDENTITY AND STATS BOTH (round 9, item 4), which is
        what `p10` and `p11` draw — the photograph runs down to the tab row.
        It can only do that from a layer behind both, so the two blocks share
        one `relative` wrapper and the cover fills the top of it.
      */}
      {/*
        `pt-[104px]` REPLACES THE BAND'S FORMER HEIGHT. The cover used to be a
        block in the flow and everything below it started underneath; now it is
        an absolute layer, so the identity row would begin at the very top of
        the photograph. This padding puts it back where it sat — overlapping
        the cover's lower half, which is `p10`'s composition.
      */}
      <div className="relative pt-[104px]">
        <ProfileCover
          /* `undefined` until migration 20260820140000 is applied — see the prop. */
          coverPath={player.cover_path}
          /* The one surface that may edit it: the owner's own profile. */
          editable
          photoVersion={player.created_at}
          t={t}
        />
        <ProfileIdentity
          nickname={player.nickname}
          photoPath={player.photo_path}
          photoVersion={player.created_at}
          countryName={countryName(player.country, locale)}
          createdAt={player.created_at}
          locale={locale}
          t={t}
        />

        <ProfileStats stats={stats} locale={locale} t={t} />
      </div>

      <ProfileTabs selected={tab} t={t} />

      {tab === "overview" && (
        <>
          {/*
            THE ADMIN PANEL'S DOOR ON A PHONE — AND IT IS ON OVERVIEW, NOT
            SETTINGS, WHICH LOOKS LIKE THE WRONG SHELF UNTIL YOU COUNT TAPS.

            The panel is reachable from the header's link row, which is `md:`
            and up, so on a phone an organizer would otherwise type
            `/admin/games` from memory. The nav pill has no room for a fifth
            tab (ruling K settled its four), and the property that was written
            down and tested is TWO TAPS: the Profile tab, then this. Filing it
            under Settings would make it three, quietly, while every comment
            and the spec still said two.

            It is also not a setting. A setting changes how this account
            behaves; this is a door into a different application.

            DISPLAY ONLY, on the same footing as the header entry: rendering
            this grants nothing and hiding it protects nothing, because anyone
            can type the URL. `requireAdmin()` in `app/admin/layout.tsx` runs
            before any nested page reads a row, and every admin RPC checks
            again inside itself.
          */}
          {isAdmin && (
            <Link
              // `/admin`, not `/admin/games` (round 14, item 8).
              href="/admin"
              data-testid="account-admin-link"
              className="mt-8 flex min-h-11 items-center justify-between gap-3 rounded-control border border-hairline-strong px-4 text-body-lg font-semibold text-bone no-underline transition-colors hover:border-hairline-volt"
            >
              {t.nav.admin}
              <span aria-hidden className="text-volt">→</span>
            </Link>
          )}

          {/*
            THE WALLET, with the passes as its only entry point. Buying credit
            is a thought someone has while looking at a balance, not while
            reading a menu — but it leads to the PASSES rather than to an
            arbitrary-amount chooser, because there is no cash wallet in this
            product's language.
          */}
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <CreditBalance balanceCzk={balanceCzk} />
            <CreditBatches batches={batches} />
            <Link
              href="/pass"
              data-testid="topup-cta"
              className="rounded-control border border-hairline-volt px-4 py-2 text-[13px] font-bold uppercase tracking-wide text-volt no-underline transition hover:bg-volt/10"
            >
              {t.account.topupCta}
            </Link>
          </div>

          <BadgeGrid badges={badges} t={t} />
        </>
      )}

      {tab === "games" && (
        <div className="mt-8">
          {history.upcoming.length === 0 && history.past.length === 0 ? (
            /*
             * THE SAME EMPTY STATE `/my-games` RENDERS, and for the same
             * reason: it sends a new player to the board rather than reporting
             * an absence. A page that says "you have no games" and stops is a
             * dead end for exactly the person most likely to be looking for
             * one.
             */
            <div data-testid="my-games-empty" className="rounded-card bg-surface p-6">
              <p className="m-0 text-[15px] leading-relaxed text-bone">
                {t.account.myGamesEmpty}
              </p>
              <Link
                href="/games"
                data-testid="my-games-empty-cta"
                className="mt-4 inline-block rounded-control bg-volt px-5 py-3 text-[15px] font-extrabold uppercase tracking-wide text-surface no-underline"
              >
                {t.account.myGamesEmptyCta}
              </Link>
            </div>
          ) : (
            <PlayerHistory history={history} />
          )}
        </div>
      )}

      {tab === "settings" && (
        <>
          {/*
            THE PROFILE BLOCK (ruling L, §3 screen 7) — display and edit. It is
            what the page is named after, and before ruling L it sat nowhere:
            the page had a photo, a balance and a list of links, and no way to
            change the six facts the product knows about you.
          */}
          <div className="mt-8">
            <ProfileDetails
              nickname={player.nickname}
              phone={player.phone}
              country={player.country}
              skillLevel={player.skill_level}
              positions={player.positions ?? []}
              email={player.email}
              countries={countryOptions(locale)}
            />
          </div>

          {/*
            THREE LINKS, ONE STACK, ALL THE SAME WEIGHT (§3.3, REQ-AUTH-020).

            Change password, change email, delete account — in that order,
            because the two things a person can fix themselves come before the
            one that needs an email to a human. Someone arriving here wanting
            out of a compromised account should meet "change your password"
            before "ask us to delete everything".

            Deletion is by email request only — there is deliberately no
            self-serve deletion UI. It is implemented as ANONYMIZATION: the
            nickname becomes `deleted-<8 hex>`, email and phone are nulled, and
            the row is retained so `events` and `credit_ledger` stay keyed to
            it. A hard delete would orphan the ledger, which is what the
            wallet's integrity rests on. The profile photo object is deleted
            from storage too, since nulling text columns leaves a public image
            of someone who asked to be forgotten.

            SIGN OUT JOINS THEM, having previously sat at the top of the page
            beside the heading. It is an account action and it belongs with the
            account actions; at the top it was the most prominent control on a
            page about a player, which had it competing with the player's own
            name.
          */}
          <section
            data-testid="account-security"
            className="mt-12 border-t border-hairline pt-6"
          >
            <SecurityLinks />
            <a
              href={deletionHref}
              data-testid="deletion-mailto"
              className="block py-2 text-[12px] text-muted no-underline transition hover:text-bone"
            >
              {t.account.deleteAccount}
            </a>

            {/* A server action, so the session cookies are cleared server-side
                rather than merely navigated away from. */}
            <form action={signOutAction} className="mt-6">
              <button
                type="submit"
                data-testid="sign-out"
                className="rounded-control border border-hairline-strong px-[14px] py-2 text-[13px] font-bold uppercase tracking-wide text-bone transition hover:border-volt hover:text-volt"
              >
                {t.auth.signOut}
              </button>
            </form>
          </section>
        </>
      )}

      {/* Signed in, or a cancellation made from this page. */}
      <ToastFromQuery query={query} />
    </main>
  );
}
