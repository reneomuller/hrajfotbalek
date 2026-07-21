import type { Metadata } from "next";
import Link from "next/link";
import { LiveTicker } from "@/components/LiveTicker";
import { NextMatchCard } from "@/components/NextMatchCard";
import { PitchBackground } from "@/components/PitchBackground";
import { getNextGame, getRoster, getTickerGame } from "@/lib/games/queries";
import { siteUrl } from "@/lib/site";
import { strings } from "@/lib/strings";

const { landing } = strings;

export async function generateMetadata(): Promise<Metadata> {
  const url = await siteUrl();
  return {
    title: strings.meta.title,
    description: strings.meta.description,
    openGraph: {
      title: strings.meta.title,
      description: strings.meta.description,
      url,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: strings.meta.title,
      description: strings.meta.description,
    },
  };
}

// The next-match block reflects live capacity, so this page renders per
// request rather than being statically cached at build time.
export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const nextGame = await getNextGame();
  // The reference shows the lineup as overlapping avatars, so the block needs
  // nicknames as well as the count. Same anon-readable view the game page uses.
  const roster = nextGame ? await getRoster(nextGame.game.id) : [];
  // The ticker can announce a game already in progress, which the next-match
  // block never shows — so it is its own query, not a slice of `nextGame`.
  const tickerGame = await getTickerGame();

  return (
    <>
      {/* Animated pitch + particle field, behind everything. */}
      <PitchBackground />

      {/* Vignette over the page — matches the reference's fixed overlay. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[1] bg-page-vignette"
      />

      {/* NAV is the shared SiteHeader, rendered once from the root layout. */}

      {/* Status ticker, in the gap between the header and the pitch touchline. */}
      <LiveTicker entry={tickerGame} />

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

          {/* Three-step explainer */}
          <div className="mt-[26px] flex flex-wrap justify-center gap-3">
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
        </section>

        {/* SCREEN 2 — next match, pay, community, footer */}
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
                roster={roster.map((row) => row.nickname)}
              />
            ) : (
              <div
                data-testid="next-game"
                className="flex min-h-[220px] items-center justify-center overflow-hidden rounded-panel border border-hairline-volt bg-surface-panel p-6"
              >
                <p className="font-mono text-[11px] tracking-[1px] text-faint">
                  {strings.games.empty}
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
            <div className="flex flex-wrap items-stretch gap-4">
              <div className="flex min-w-[270px] flex-1 flex-col justify-center rounded-[20px] border border-hairline-volt-soft bg-surface-card-strong p-[22px] text-center">
                <h3 className="m-0 mb-[6px] font-display text-community-title uppercase text-white">
                  {landing.community.title}
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
