import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeGrid } from "@/components/account/BadgeGrid";
import { ProfileCover } from "@/components/account/ProfileCover";
import { ProfileStats } from "@/components/account/ProfileStats";
import { PublicIdentity } from "@/components/player/PublicIdentity";
import { getLocale, getStrings } from "@/lib/i18n/server";
import { playerBadges } from "@/lib/profile/badges";
import { getPublicProfile } from "@/lib/players/publicProfile";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ nickname: string }>;
}): Promise<Metadata> {
  const { nickname } = await params;
  const profile = await getPublicProfile(decodeURIComponent(nickname));
  // `robots: noindex` — a player did not ask to be a search result. The page is
  // PUBLIC in the sense that anyone with the link may read it, which is not the
  // same as asking Google to keep a copy.
  return {
    title: profile?.nickname ?? "",
    robots: { index: false, follow: false },
  };
}

/**
 * `/player/[nickname]` — the public profile, with the quarantine LIFTED
 * (round 14, item 13).
 *
 * `SCOPE.md` §2 quarantined this because a profile is the surface where a
 * product accidentally publishes a phone number. The owner lifted it with an
 * exact scope, and the scope IS the ruling: profile picture, banner, the three
 * stats, badges. Nothing else.
 *
 * THE ENFORCEMENT IS THE RPC, NOT THIS PAGE. `public_player_profile` returns a
 * six-column composite and there is no way to ask it for a seventh — so a
 * later edit here cannot leak a field, because the field never arrives. A page
 * that merely declined to render the rest would be one `select *` away.
 *
 * A ROUTE, NOT A MODAL. Three reasons, in order: it is shareable, which is
 * most of the point of a roster you can tap; it reuses `ProfileCover`,
 * `ProfileStats` and `BadgeGrid` exactly as the owner's own profile composes
 * them, so the two cannot drift; and a modal over a game page would put a
 * banner-height photograph inside a dialog on a 390px screen.
 *
 * NO CHROME BEYOND THE SHELL. No tabs, no "message this player", no follow. A
 * page whose whole content is four read-only things does not need navigation
 * of its own — the back button is the affordance.
 */
export default async function PublicPlayerPage({
  params,
}: {
  params: Promise<{ nickname: string }>;
}) {
  const { nickname } = await params;
  const [t, locale] = await Promise.all([getStrings(), getLocale()]);

  const profile = await getPublicProfile(decodeURIComponent(nickname));

  /*
   * A GUEST, A SHADOW OR A STRANGER ALL 404 IDENTICALLY. The RPC returns null
   * for each, and distinguishing them here would answer "does this nickname
   * belong to a real account" for anyone willing to type one in.
   */
  if (!profile) notFound();

  const stats = { gamesPlayed: profile.gamesPlayed, hours: profile.hours, venues: profile.venues };
  const badges = playerBadges(stats, t);

  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-24">
      {/*
        THE SAME COMPOSITION AS THE OWNER'S OWN PROFILE — one `relative`
        wrapper, the cover as an absolute layer behind identity and stats, and
        `pt-[104px]` putting the identity row back over the photograph's lower
        half. Copied in structure rather than extracted into a shared shell:
        the two pages differ in everything BELOW this block, and a wrapper
        component parameterised over "which page am I" is how one of them ends
        up rendering the other's tabs.
      */}
      <div className="relative pt-[104px]">
        <ProfileCover coverPath={profile.coverPath} photoVersion={null} t={t} />
        <PublicIdentity nickname={profile.nickname} photoPath={profile.photoPath} />
        <ProfileStats stats={stats} locale={locale} t={t} />
      </div>

      <BadgeGrid badges={badges} t={t} />
    </main>
  );
}
