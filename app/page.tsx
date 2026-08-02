import type { Metadata } from "next";
import Link from "next/link";
import { FaqPanel } from "@/components/home/FaqPanel";
import { PlayerOfMonthPanel } from "@/components/home/PlayerOfMonthPanel";
import { NextMatchCard } from "@/components/NextMatchCard";
import { getHomeContent } from "@/lib/home/queries";
import { getNextGame, getRoster, getVenue } from "@/lib/games/queries";
import { siteUrl } from "@/lib/site";
import { getStrings } from "@/lib/i18n/server";


export async function generateMetadata(): Promise<Metadata> {
  const t = await getStrings();
  const url = await siteUrl();
  return {
    title: t.meta.title,
    description: t.meta.description,
    openGraph: {
      title: t.meta.title,
      description: t.meta.description,
      url,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: t.meta.title,
      description: t.meta.description,
    },
  };
}

// The next-match block reflects live capacity, so this page renders per
// request rather than being statically cached at build time.
export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const t = await getStrings();
  const { landing } = t;
  const nextGame = await getNextGame();
  // The reference shows the lineup as overlapping avatars, so the block needs
  // nicknames as well as the count. Same anon-readable view the game page uses.
  const roster = nextGame ? await getRoster(nextGame.game.id) : [];
  // The venue behind the game, for the map panel's photo. Null for a game
  // created before venues existed — the panel holds its own without one.
  const venueRow = nextGame ? await getVenue(nextGame.game.venue_id) : null;
  // Absolute, for the share link — a wa.me message carrying a relative path is
  // a message nobody can open.
  const base = await siteUrl();
  // Storage origin for the roster photos (§4a). Absent, avatars fall back to
  // initials, which is the ordinary case rather than a failure.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  // Admin-editable content plus the computed games-per-week (§6). Every read
  // behind this is anon-legal, because this page is what a shared WhatsApp
  // link opens for someone with no account.
  const home = await getHomeContent();

  return (
    <>
      {/* Pitch, grain and vignette are the shared SiteBackground, mounted once
          from the root layout. This route is what puts it at full strength —
          see components/SiteBackground.tsx. */}

      {/* NAV is the shared SiteHeader, rendered once from the root layout. */}

      <div className="relative z-10 mx-auto w-full max-w-shell px-gutter">
        {/* HERO */}
        <section className="flex min-h-[100svh] flex-col pb-6 pt-20 text-center">
          <div className="flex flex-1 flex-col items-center justify-center">
            <h1 className="m-0 font-display text-hero uppercase text-white">
              {landing.headlineLead}
              <br />
              {landing.headlineAccent}
              <span className="text-volt">.</span>
            </h1>

            <div className="mt-[22px] font-condensed text-hero-sub font-bold uppercase italic tracking-wide text-volt">
              {landing.heroSub}
            </div>

            <p className="mx-auto mt-[14px] max-w-[440px] text-lede text-muted">
              {landing.vision}
            </p>

            {/* Primary CTA — the games list, not an in-page anchor. */}
            <Link
              href="/games"
              className="mt-[30px] inline-flex items-center gap-[9px] rounded-cta bg-volt px-[26px] py-[15px] font-condensed text-cta font-extrabold uppercase tracking-wide text-surface no-underline"
            >
              {landing.heroCta}
            </Link>

            <div className="mt-[30px] animate-floatY font-mono text-[9px] tracking-eyebrow text-dim">
              {landing.scrollHint}
            </div>
          </div>

          {/*
            HOW IT WORKS — BACK WHERE IT WAS, closing the hero.

            Phase 17 moved this to the top of the second screen on the reading
            of §6 that it belongs "above fold-two content". Reverted on review:
            the strip is part of the hero's rhythm, and lifting it out left the
            first screen ending on a scroll hint with nothing under the fold
            line to explain the product. The equipment line stays attached to
            it, which is the part of §6 that was actually load-bearing —
            "what do I bring" is the second question anyone asks.
          */}
          <div data-testid="how-it-works" className="mt-[26px]">
            <div className="flex flex-wrap justify-center gap-3">
              {landing.steps.map((step) => (
                <div
                  key={step.index}
                  className="flex min-w-[200px] flex-1 items-start gap-3 rounded-card border border-hairline bg-surface-card px-[18px] py-[15px] text-left"
                >
                  <div className="font-mono text-[14px] font-bold text-volt">
                    {step.index}
                  </div>
                  <div>
                    <div className="font-condensed text-[18px] font-bold tracking-[.3px]">
                      {step.title}
                    </div>
                    <div className="mt-[3px] text-[13px] leading-[1.45] text-muted-dim">
                      {step.body}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p
              data-testid="equipment-line"
              className="mt-3 text-center font-mono text-[11px] tracking-[1px] text-volt-dim"
            >
              {landing.equipmentLine}
            </p>
          </div>
        </section>

        {/* SCREEN 2 — next match, community, footer */}
        <div id="next-match" className="flex min-h-[100svh] flex-col pt-nav">
          <div className="flex-1" />

          <section className="pb-3 pt-[10px]">
            <div className="mb-[18px] flex items-baseline gap-3">
              <div className="font-mono text-[10px] tracking-eyebrow text-volt-dim">
                {landing.nextMatchEyebrow}
              </div>
              <h2 className="m-0 font-display text-section-title uppercase tracking-wide text-white">
                {landing.nextMatchLabel}
              </h2>
            </div>

            {/*
              The reference's match card, wired to live data: date, counter,
              capacity bar, lineup avatars and spots-left all come from the DB.
            */}
            {nextGame ? (
              <NextMatchCard
                game={nextGame.game}
                bookedCount={nextGame.bookedCount}
                roster={roster.map((row) => ({
                  nickname: row.nickname,
                  photoPath: row.photo_path,
                }))}
                venueRow={venueRow}
                shareUrl={`${base}/game/${nextGame.game.id}`}
                supabaseUrl={supabaseUrl}
              />
            ) : (
              <div
                data-testid="next-game"
                className="flex min-h-[220px] items-center justify-center overflow-hidden rounded-panel border border-hairline-volt bg-surface-panel p-6"
              >
                <p className="font-mono text-[11px] tracking-[1px] text-faint">
                  {t.games.empty}
                </p>
              </div>
            )}
          </section>

          {/*
            COMMUNITY — full width. The pay-ahead panel that used to share this
            row is gone: payment choice belongs to the booking flow, and a
            landing tile advertising a price is one more thing to keep in sync
            with `games.price_czk`.
          */}
          <section className="pt-4">
            {/* THREE EQUAL PANELS (§6, REQ-HOME-005): Join · FAQ · Player of
                the Month. `flex-1` with a shared min-width, so they sit as
                three columns on a wide screen and stack in that order on a
                phone. */}
            <div className="flex flex-wrap items-stretch gap-4">
              <div className="flex min-w-[270px] flex-1 flex-col justify-center rounded-[20px] border border-hairline-volt-soft bg-surface-card-strong p-[22px] text-center">
                {/*
                  v1.1.4 D — the heading carries the SAME admin-editable number
                  the stats strip shows. One number, one source: a heading with
                  its own hard-coded figure goes stale silently. Falls back to
                  the plain heading when nothing has been set, rather than
                  printing "a community of +".
                */}
                <h3
                  data-testid="community-heading"
                  className="m-0 mb-[6px] font-display text-community-title uppercase text-white"
                >
                  {home.activePlayers !== null
                    ? landing.community.titleWithCount.replace(
                        "{count}",
                        String(home.activePlayers),
                      )
                    : landing.community.title}
                </h3>
                <p className="mx-auto mb-4 max-w-[320px] text-[13px] text-muted-dim">
                  {landing.community.body}
                </p>
                <div className="flex flex-wrap justify-center gap-[10px]">
                  <a
                    href={landing.community.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-[9px] rounded-cta border border-hairline-link px-5 py-[13px] font-condensed text-[15px] font-bold tracking-wide text-bone no-underline transition hover:border-whatsapp"
                  >
                    <span className="inline-block h-5 w-5 rounded-full bg-whatsapp" />
                    {landing.community.whatsapp}
                  </a>
                  <a
                    href={landing.community.instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-[9px] rounded-cta border border-hairline-link px-5 py-[13px] font-condensed text-[15px] font-bold tracking-wide text-bone no-underline transition hover:border-volt"
                  >
                    <span className="inline-block h-5 w-5 rounded-[6px] bg-instagram" />
                    {landing.community.instagram}
                  </a>
                </div>
              </div>

              <FaqPanel />

              <PlayerOfMonthPanel
                player={home.playerOfMonth}
                supabaseUrl={supabaseUrl}
              />
            </div>
          </section>

          <div className="flex-1" />

          {/* FOOTER */}
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline-chrome pb-6 pt-5">
            <div className="font-condensed text-[14px] font-bold tracking-wide text-footer-dim">
              {landing.footer.wordmarkLead}{" "}
              <span className="text-volt-dim">
                {landing.footer.wordmarkAccent}
              </span>{" "}
              {landing.footer.city}
            </div>
            <div className="font-mono text-[9px] tracking-[2px] text-dim">
              {landing.footer.tagline}
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}
