import { strings } from "@/lib/strings";

const { landing, brand, nav } = strings;

export default function LandingPage() {
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
              ================= PHASE 10 PLACEHOLDER SLOT =================
              The live next-game block wires in here.

              Phase 10 replaces the contents of this container with the real
              game card: venue, kickoff time (via `lib/format.ts`, never raw
              UTC), the live capacity counter, the public roster read through
              the `game_roster_public` view, and the join/waitlist CTA.

              Keep the container chrome below — border, radius and background
              are theme tokens matched to the design reference. Only the inner
              content is Phase 10's to replace.
              =============================================================
            */}
            <div
              data-phase-10-slot="next-game"
              className="flex min-h-[220px] items-center justify-center overflow-hidden rounded-panel border border-hairline-volt bg-surface-panel p-6"
            >
              <p className="font-mono text-[11px] tracking-[1px] text-faint">
                {landing.nextMatchPlaceholder}
              </p>
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
