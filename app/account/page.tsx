import { photoVersionFor } from "@/lib/storage/avatar";
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
import {
  getOwnCreditBalance,
  listOwnBookings,
  listOwnWaitlisted,
} from "@/lib/booking/queries";
import { getLocale, getStrings } from "@/lib/i18n/server";
import { listMyBatches } from "@/lib/pass/queries";
import { playerBadges } from "@/lib/profile/badges";
import { profileStats } from "@/lib/profile/stats";
import { playersMetFor } from "@/lib/profile/playersMet";
import { appCapabilities } from "@/lib/db/capabilities";
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
  const [balanceCzk, batches, bookings, waitlisted, capabilities] = await Promise.all([
    getOwnCreditBalance(),
    // The wallet broken into batches (§4.2). A single number cannot say that
    // 750 of a 900 balance runs out on the 3rd, which is the one thing a pass
    // holder needs in order to use it.
    listMyBatches(),
    listOwnBookings(),
    // Round 16 item 12 — the Waitlist subsection under My games.
    listOwnWaitlisted(),
    appCapabilities(),
  ]);

  /*
   * PLAYERS MET (round 23, item 1) — the third tile, when the database can
   * count it.
   *
   * TWO GATES, AND THEY ARE NOT REDUNDANT. `capabilities.playersMet` says the
   * migration has landed, so the call is worth making at all; the call's own
   * result says an answer actually arrived. Asking without the flag would fire
   * a 404 on every profile render for as long as the migration is unapplied,
   * and trusting the flag without checking the answer would render a confident
   * zero if the grant were missing.
   */
  const playersMet = capabilities.playersMet ? await playersMetFor(player.id) : null;

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
          photoVersion={photoVersionFor(player)}
          t={t}
        />
        <ProfileIdentity
          nickname={player.nickname}
          photoPath={player.photo_path}
          photoVersion={photoVersionFor(player)}
          countryName={countryName(player.country, locale)}
          createdAt={player.created_at}
          locale={locale}
          t={t}
        />

        <ProfileStats stats={stats} playersMet={playersMet} locale={locale} t={t} />
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
          {/*
            `mt-6` and `gap-3`, not `mt-8` and `gap-4` (round 23, item 3). The
            wallet lost its second heading and its second card, so the space
            around it was sized for a block twice this tall.
          */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <CreditBalance balanceCzk={balanceCzk} batches={batches} />
            <Link
              href="/pass"
              data-testid="topup-cta"
              className="rounded-control border border-hairline-volt px-4 py-2 text-[13px] font-bold uppercase tracking-wide text-volt no-underline transition hover:bg-volt/10"
            >
              {t.account.topupCta}
            </Link>
          </div>

          {/*
            EVERYTHING THAT WAS UNDER "Settings" (round 16, item 14).

            THE SPLIT WAS DEFENSIBLE AND STILL WRONG. Ruling L's reasoning was
            that Overview holds what you look at and Settings what you change —
            a clean line, and it cost a tap on the two things people actually
            come to this page to do: fix a phone number and sign out. Three
            tabs for one screen's worth of content is a tab bar earning its
            keep on the strength of the tab bar.

            ~~THE ORDER IS LOOK, THEN CHANGE. The wallet, the badges and the
            admin door are what a player reads; the edit fields and the account
            actions are what they act on, and they come after.~~
            
            THE OWNER SWAPPED IT (round 17, item 3): details above, badges at
            the bottom. His ordering is the better one and the reason is what
            the page is FOR. Somebody opens their profile to check or fix a
            fact about themselves — a phone number, a position, an email — and
            under the old order that meant scrolling past five badge tiles,
            four of which are things they have not done yet. Badges are the
            reward for using the product, not the reason to open this screen,
            so they sit where a reward sits: at the end.
          */}
          {/*
            THE PROFILE BLOCK (ruling L, §3 screen 7) — display and edit. It is
            what the page is named after, and before ruling L it sat nowhere:
            the page had a photo, a balance and a list of links, and no way to
            change the six facts the product knows about you.
          */}
          {/*
            A HEADING, WHICH IT DID NOT NEED AS A TAB AND DOES NOW.

            Under Settings this block WAS the screen, so it explained itself.
            On the overview it follows the badge grid, and a reader scrolling
            past meets a card that opens with "DISPLAY NAME" and no statement
            of what they are looking at. The other two blocks on this tab —
            the wallet and the badges — both announce themselves; this is the
            one that stopped doing so when it moved.
          */}
          <h2 className="mt-12 mb-0 text-[17px] font-bold uppercase tracking-wide text-white">
            {t.profile.detailsTitle}
          </h2>

          <div className="mt-4">
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
            BADGES LAST — genuinely last (round 17, item 3).

            The owner asked for details above and badges at the bottom, and
            "the bottom" has to mean below the account actions too: change
            password, delete account and sign out belong WITH the details they
            act on, so slotting badges between the two would separate a block
            from its own controls to satisfy the letter of the instruction.

            It also reads better. The page now runs wallet -> who you are ->
            what you can do about it -> what you have earned, which is
            descending order of why somebody opened it.
          */}
          <BadgeGrid badges={badges} t={t} />

          {/*
            THE ACCOUNT ACTIONS, NOW BELOW THE BADGES (round 17, item 5).

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
            {/*
              SIGN OUT LEADS THE BLOCK NOW (round 17, item 5), where it used to
              close it.

              The owner asked for "Change my password" and "Delete my account"
              at the very bottom, in that order, as quiet text links. Sign out
              is neither of those two and is not a text link — it is the one
              affirmative control here — so leaving it last would have put a
              bordered button below the destructive link the item says comes
              last.

              It stays IN this block rather than moving somewhere else: round
              16 put it here because it is an account action and belongs with
              the account actions, and nothing about that changed.

              A server action, so the session cookies are cleared server-side
              rather than merely navigated away from.
            */}
            <form action={signOutAction} className="mb-4">
              <button
                type="submit"
                data-testid="sign-out"
                className="rounded-control border border-hairline-strong px-[14px] py-2 text-[13px] font-bold uppercase tracking-wide text-bone transition hover:border-volt hover:text-volt"
              >
                {t.auth.signOut}
              </button>
            </form>

            <SecurityLinks />

            {/*
              DESTRUCTIVE LAST (round 17, item 5), and it keeps the flow it
              had: a `mailto:` to a human, because deletion is implemented as
              ANONYMIZATION and there is deliberately no self-serve path.
            */}
            <a
              href={deletionHref}
              data-testid="deletion-mailto"
              className="block py-2 text-[12px] text-muted no-underline transition hover:text-bone"
            >
              {t.account.deleteAccount}
            </a>
          </section>
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
            <PlayerHistory history={history} waitlisted={waitlisted} />
          )}
        </div>
      )}


      {/* Signed in, or a cancellation made from this page. */}
      <ToastFromQuery query={query} />
    </main>
  );
}
