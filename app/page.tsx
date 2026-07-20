import type { Metadata } from "next";
import Link from "next/link";
import { GameCard } from "@/components/GameCard";
import { getNextGame } from "@/lib/games/queries";
import { siteUrl } from "@/lib/site";
import { strings } from "@/lib/strings";

const { landing, brand, nav } = strings;

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

  return (
    <>
      {/* Vignette over the page — matches the reference's fixed overlay. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[1] bg-page-vignette"
      />

      {/* NAV */}
      <header className="fixed inset-x-0 top-0 z-30 border-b border-hairline bg-ink/[.72] backdrop-blur-md">
        <div className="mx-auto flex max-w-shell items-center justify-between px-gutter py-[11px]">
          <div className="flex items-center gap-[10px]">
            <div className="flex h-[38px] w-[38px] items-center justify-center rounded-badge border-[1.5px] border-volt bg-surface font-condensed text-[19px] font-extrabold italic tracking-[-1px]">
              <span className="text-white">{brand.monogramLead}</span>
              <span className="text-volt">{brand.monogramAccent}</span>
            </div>
            <div className="font-condensed text-[16px] font-bold leading-none tracking-wide">
              {brand.wordmarkLead}{" "}
              <span className="text-volt">{brand.wordmarkAccent}</span>
            </div>
          </div>

          <a
            href="#next-match"
            className="rounded-control bg-volt px-[14px] py-2 font-condensed text-[13px] font-extrabold uppercase tracking-wide text-surface no-underline"
          >
            {nav.cta}
          </a>
        </div>
      </header>

      <div className="relative z-10 mx-auto w-full max-w-shell px-gutter">
        {/* HERO */}
        <section className="flex min-h-[100svh] flex-col pb-6 pt-20 text-center">
          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="mb-[18px] flex items-center gap-[14px] font-mono text-eyebrow tracking-eyebrow text-volt-dim">
              <span className="h-[7px] w-[7px] animate-blink rounded-full bg-volt shadow-volt-glow" />
              {landing.liveBadge}
            </div>

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

            <a
              href="#next-match"
              className="mt-[30px] inline-flex items-center gap-[9px] rounded-cta bg-volt px-[26px] py-[15px] font-condensed text-cta font-extrabold uppercase tracking-wide text-surface no-underline"
            >
              {landing.heroCta}
            </a>

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
              Live next-game block (Phase 10). The container chrome is the
              original slot's — only the inner content is real data now.
            */}
            <div
              data-testid="next-game"
              className="min-h-[220px] overflow-hidden rounded-panel border border-hairline-volt bg-surface-panel p-6"
            >
              {nextGame ? (
                <>
                  <GameCard
                    game={nextGame.game}
                    bookedCount={nextGame.bookedCount}
                    featured
                  />
                  <Link
                    href={`/game/${nextGame.game.id}`}
                    className="mt-4 block rounded-cta bg-volt px-6 py-[14px] text-center font-condensed text-cta font-extrabold uppercase tracking-wide text-surface no-underline"
                  >
                    {landing.nextMatchCta}
                  </Link>
                </>
              ) : (
                <div className="flex min-h-[180px] items-center justify-center">
                  <p className="font-mono text-[11px] tracking-[1px] text-faint">
                    {strings.games.empty}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* PAY + COMMUNITY */}
          <section className="pt-4">
            <div className="flex flex-wrap items-stretch gap-4">
              <div className="flex min-w-[270px] flex-1 flex-wrap items-center gap-[18px] rounded-[20px] border border-hairline-strong bg-surface-card p-[22px]">
                <div className="h-[104px] w-[104px] flex-none rounded-[14px] bg-white p-[6px]">
                  {/* Static illustrative QR; the real per-booking SPD code is Phase 12. */}
                  <div className="h-full w-full rounded-control bg-qr-checker bg-[length:16px_16px]" />
                </div>
                <div className="min-w-[160px] flex-1">
                  <div className="font-display text-[clamp(20px,4.5vw,26px)] uppercase tracking-[.3px] text-white">
                    {landing.pay.title}
                  </div>
                  <div className="mt-[6px] max-w-[300px] text-[13px] leading-[1.5] text-muted">
                    {landing.pay.body}
                  </div>
                  <div className="mt-3 flex items-baseline gap-[10px]">
                    <span className="font-mono text-[24px] font-bold text-volt">
                      150 {strings.common.czk}
                    </span>
                    <span className="text-[12px] text-faint">
                      {landing.pay.perGame}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex min-w-[270px] flex-1 flex-col justify-center rounded-[20px] border border-hairline-volt bg-surface-card p-[22px] text-center">
                <h3 className="m-0 mb-[6px] font-display text-[clamp(20px,4.6vw,28px)] uppercase text-white">
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
                    className="flex items-center gap-[9px] rounded-cta border border-hairline-strong px-5 py-[13px] font-condensed text-[15px] font-bold tracking-wide text-bone no-underline transition hover:border-whatsapp"
                  >
                    <span className="inline-block h-5 w-5 rounded-full bg-whatsapp" />
                    {landing.community.whatsapp}
                  </a>
                  <a
                    href={landing.community.instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-[9px] rounded-cta border border-hairline-strong px-5 py-[13px] font-condensed text-[15px] font-bold tracking-wide text-bone no-underline transition hover:border-volt"
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
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pb-6 pt-5">
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
