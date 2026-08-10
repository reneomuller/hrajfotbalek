import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
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
        {/*
          HERO — SIZED TO ITS CONTENT (ruling J: at least 25% shorter).

          It was `min-h-[100svh]` with the content centred inside, so the hero
          was a full screen whatever it contained and the three step cards
          could never clear the fold — which is the whole thing ruling J is
          about. Type carried part of the reduction in Stage 0 (`hero` dropped
          from clamp(58,12.5vw,124) to clamp(44,10vw,88)); this is the rest of
          it, and it is the larger half.

          The scroll hint goes with it. It existed to tell a reader there was
          something below a screen-filling hero; once the steps are visible it
          is an arrow pointing at what is already on screen.
        */}
        <section className="flex flex-col pb-10 pt-20 text-center">
          <div className="flex flex-col items-center justify-center">
            <h1 className="m-0 font-display text-hero uppercase text-white">
              {landing.headlineLead}
              <br />
              {landing.headlineAccent}
              <span className="text-volt">.</span>
            </h1>

            <div className="mt-4 text-hero-sub font-bold uppercase italic tracking-wide text-volt">
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
              className="mt-6 inline-flex items-center gap-[9px] rounded-control bg-volt px-[26px] py-[15px] text-cta font-extrabold uppercase tracking-wide text-surface no-underline"
            >
              {landing.heroCta}
            </Link>

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

        {/*
          BELOW THE HERO — ruling J's order, as amended 2026-08-10:
          upcoming games, active-players banner, community, FAQ, Player of the
          Month, footer.

          NO `min-h-[100svh]` AND NO FLEX SPACERS. This was a second full
          screen with `flex-1` gaps pushing its contents to the vertical
          middle, which is what made the page read as two slides rather than
          as a page. With the hero sized to its content there is nothing left
          to pad against — the sections simply follow one another.
        */}
        <div id="next-match" className="flex flex-col pt-nav">
          <section className="pb-3 pt-[10px]">
            <div className="mb-[14px] flex items-baseline gap-3">
              <div className="text-[10px] tracking-eyebrow text-volt-dim">
                {landing.nextMatchEyebrow}
              </div>
              <h2 className="m-0 font-display text-section-title uppercase tracking-wide text-white">
                {landing.nextMatchesLabel}
              </h2>
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
              /*
                ZERO UPCOMING GAMES — the §2.9 empty state with the WhatsApp
                action, which ruling J names specifically. It replaced a
                centred grey sentence in a box: "No games on the board right
                now" is a dead end on the first screen a visitor sees, and the
                WhatsApp group is the one thing they can actually do about it.
              */
              <EmptyState
                title={t.games.emptyTitle}
                body={t.games.emptyBody}
                ctaLabel={t.games.emptyCta}
                ctaHref={t.landing.community.whatsappUrl}
              />
            )}

            {/*
              `All games` AS A PRIMARY BUTTON AT THE SECTION'S BOTTOM (ruling
              J), not an eyebrow link in the heading row.

              It was a 10px tracked-caps link sitting to the right of the
              section title — read before the cards rather than after them,
              and styled as a label rather than as the action it is. At the
              bottom it is the natural next step for someone who has just read
              three cards and wants the rest.

              IT RENDERS AT ZERO TOO, and that is deliberate: ruling J says
              the button stays whether the section shows three games, one, or
              none. A visitor who arrives on an empty week should still be
              able to reach the board.
            */}
            <div className="mt-5 flex justify-center">
              <Link
                href="/games"
                data-testid="next-matches-all"
                className="inline-flex min-h-11 items-center justify-center rounded-control bg-volt px-6 text-body-lg font-bold text-ink no-underline transition-colors hover:bg-volt-dim"
              >
                {landing.nextMatchesAll}
              </Link>
            </div>
          </section>

          {/*
            THE ACTIVE-PLAYERS BANNER, full width and ahead of the panels —
            ruling J's order. It was a column in a four-panel row, where a pair
            of numbers competed with a FAQ list for the same width and won
            neither the space nor the attention.
          */}
          <section className="pt-8">
            <StatsPanel
              gamesPerWeek={home.gamesPerWeek}
              activePlayers={home.activePlayers}
            />
          </section>

          {/*
            THEN COMMUNITY, FAQ AND PLAYER OF THE MONTH, in that order.

            PLAYER OF THE MONTH SURVIVES RULING J by the amendment of
            2026-08-10 — recorded in DESIGN_SYSTEM_V1.3.md next to the order
            it changes, because an un-amended ruling is how a reversal gets
            quietly re-applied by a later session reading the document
            faithfully. It keeps the hours-on-pitch stat, which is what earns
            it the space the original ruling said it had not.
          */}
          <section className="pt-4">
            <div className="flex flex-wrap items-stretch gap-4">
              <CommunityPanel />
              <FaqPanel />
              <PlayerOfMonthPanel
                player={home.playerOfMonth}
                supabaseUrl={supabaseUrl}
              />
            </div>
          </section>

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
