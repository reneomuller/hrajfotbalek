import type { Metadata } from "next";
import Link from "next/link";
import { CommunityPanel } from "@/components/home/CommunityPanel";
import { FaqPanel } from "@/components/home/FaqPanel";
import { PlayerOfMonthPanel } from "@/components/home/PlayerOfMonthPanel";
import { StatsPanel } from "@/components/home/StatsPanel";
import { GameCard } from "@/components/game/GameCard";
import { getHomeContent } from "@/lib/home/queries";
import { listRostersByGame, listUpcomingGames } from "@/lib/games/queries";
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

/**
 * A line of copy split at its SENTENCE boundaries, so each sentence gets its
 * own line and cannot be broken across one.
 *
 * `text-wrap: balance` alone got the orphan out — it evened the two lines in
 * every language — but in English it balanced to "…repeats itself. Find" /
 * "a game, claim your spot, show up.", which has no orphan and still does not
 * read as two phrases. Czech and Russian happened to land on the sentence
 * boundary by length, which is luck rather than layout.
 *
 * So the boundary is made explicit and balance stays INSIDE each sentence, for
 * the case where one is long enough to wrap on its own.
 *
 * A HARDCODED `<br>` was the alternative and is a decision about English: the
 * three strings are different lengths, so it fixes one language and orphans
 * another. This reads the boundary out of whatever string it is given.
 *
 * Falls back to the whole string when there is no boundary to find, so a copy
 * edit that drops the full stop degrades to today's behaviour rather than to
 * an empty paragraph.
 */
function sentences(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]*\s*/g);
  if (!parts || parts.length < 2) return [text];
  return parts.map((part) => part.trim()).filter(Boolean);
}

export default async function LandingPage() {
  const t = await getStrings();
  const { landing } = t;

  /*
   * THREE GAMES, NOT ONE (v1.2 §6). This page showed a single "NEXT MATCH"
   * card: a venue photo, a countdown, overlapping avatars and a claim button,
   * about 400px of one game. It could only ever answer "is there a game", and
   * the question a visitor arrives with is "is there a game I CAN MAKE" — which
   * a single card answers "no" to as often as not, on a Tuesday, for a game on
   * Thursday that they cannot do.
   *
   * So: the next three, in the same compact row the games list uses. Not a
   * similar row — the SAME component, so the price stays off it, the format
   * stays on it and the spots-left ladder cannot drift between the two
   * surfaces. Three of them fit in less height than the one card did.
   */
  const { games } = await listUpcomingGames(3);
  // The canonical card carries an avatar stack (§2.1, ruling D), so the home
  // preview needs the same roster read the list does — one round trip for all
  // three games rather than one apiece.
  const rosters = await listRostersByGame(games.map(({ game }) => game.id));
  // Storage origin for the Player-of-the-Month photo (§4a). Absent, the panel
  // falls back to initials, which is the ordinary case rather than a failure.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  // Admin-editable content (§6). Every read behind this is anon-legal, because
  // this page is what a shared WhatsApp link opens for someone with no account.
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

            <div className="mt-[22px] text-hero-sub font-bold uppercase italic tracking-wide text-volt">
              {landing.heroSub}
            </div>

            {/*
              `text-wrap: balance` rather than a manual break or an nbsp.

              The line was orphaning a word or two onto a second row, which
              reads as a rendering accident rather than as a phrase. The two
              alternatives both fail on this string specifically: a hardcoded
              `<br>` at the sentence boundary is a decision about ENGLISH, and
              the Czech and Russian are different lengths, so it orphans in one
              of them instead; an nbsp before the last word fixes one width and
              moves the problem at another.

              Balance is the property that actually describes the goal — even
              line lengths, no short last line — and the browser applies it per
              language and per width. Where it is unsupported the text wraps
              exactly as it does today, so the floor is the current behaviour
              rather than a broken one.

              `max-w-[34ch]` replaces the 440px cap for the same reason: a
              character-relative measure holds the line count steady when the
              face changes, and item 11 is about to change the face.
            */}
            <p
              data-testid="hero-vision"
              className="mx-auto mt-[14px] max-w-[34ch] text-lede text-muted"
            >
              {sentences(landing.vision).map((sentence) => (
                <span key={sentence} className="block text-balance">
                  {sentence}
                </span>
              ))}
            </p>

            {/* Primary CTA — the games list, not an in-page anchor. */}
            <Link
              href="/games"
              className="mt-[30px] inline-flex items-center gap-[9px] rounded-control bg-volt px-[26px] py-[15px] text-cta font-extrabold uppercase tracking-wide text-surface no-underline"
            >
              {landing.heroCta}
            </Link>

            <div className="mt-[30px] animate-floatY text-[9px] tracking-eyebrow text-faint">
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
                  className="flex min-w-[200px] flex-1 items-start gap-3 rounded-card bg-surface px-[18px] py-[15px] text-left"
                >
                  <div className="text-[14px] font-bold text-volt">
                    {step.index}
                  </div>
                  <div>
                    <div className=" text-[18px] font-bold tracking-[.3px]">
                      {step.title}
                    </div>
                    <div className="mt-[3px] text-[13px] leading-[1.45] text-muted">
                      {step.body}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p
              data-testid="equipment-line"
              className="mt-3 text-center text-[11px] tracking-[1px] text-volt-dim"
            >
              {landing.equipmentLine}
            </p>
          </div>
        </section>

        {/* SCREEN 2 — next match, community, footer */}
        <div id="next-match" className="flex min-h-[100svh] flex-col pt-nav">
          <div className="flex-1" />

          <section className="pb-3 pt-[10px]">
            <div className="mb-[14px] flex items-baseline gap-3">
              <div className="text-[10px] tracking-eyebrow text-volt-dim">
                {landing.nextMatchEyebrow}
              </div>
              <h2 className="m-0 font-display text-section-title uppercase tracking-wide text-white">
                {landing.nextMatchesLabel}
              </h2>
              {/* The way to the rest of them. A section showing three of
                  something needs to say that three is not all of it. */}
              <Link
                href="/games"
                data-testid="next-matches-all"
                className="ml-auto shrink-0 text-[10px] uppercase tracking-eyebrow text-volt no-underline"
              >
                {landing.nextMatchesAll}
              </Link>
            </div>

            {games.length > 0 ? (
              <div data-testid="next-matches" className="flex flex-col gap-3">
                {games.map(({ game, bookedCount }) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    bookedCount={bookedCount}
                    roster={rosters.get(game.id) ?? []}
                    supabaseUrl={supabaseUrl}
                  />
                ))}
              </div>
            ) : (
              <div
                data-testid="next-game"
                className="flex min-h-[120px] items-center justify-center overflow-hidden rounded-card bg-surface p-6"
              >
                <p className="text-[11px] tracking-[1px] text-faint">
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
            {/*
              FOUR PANELS (§6, REQ-HOME-005 as amended v1.2): Join · Numbers ·
              FAQ · Player of the Month. `flex-1` with a shared min-width, so
              they sit as columns on a wide screen and stack in that order on a
              phone.

              The first two were ONE panel, whose heading was itself a statistic
              — "JOIN A COMMUNITY OF 500+ ACTIVE PLAYERS ACROSS PRAGUE" — with
              the WhatsApp and Instagram links beneath it. That heading did two
              jobs and did neither: as a call to action it buried the verb in
              the middle of a claim, and as a statistic it could carry exactly
              one number, so the second one had nowhere to live. Splitting them
              gives the invitation a verb and the numbers a home.
            */}
            <div className="flex flex-wrap items-stretch gap-4">
              <CommunityPanel />

              <StatsPanel
                gamesPerWeek={home.gamesPerWeek}
                activePlayers={home.activePlayers}
              />

              <FaqPanel />

              <PlayerOfMonthPanel
                player={home.playerOfMonth}
                supabaseUrl={supabaseUrl}
              />
            </div>
          </section>

          <div className="flex-1" />

          {/* FOOTER */}
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pb-6 pt-5">
            <div className=" text-[14px] font-bold tracking-wide text-muted">
              {landing.footer.wordmarkLead}{" "}
              <span className="text-volt-dim">
                {landing.footer.wordmarkAccent}
              </span>{" "}
              {landing.footer.city}
            </div>
            <div className="text-[9px] tracking-[2px] text-faint">
              {landing.footer.tagline}
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}
