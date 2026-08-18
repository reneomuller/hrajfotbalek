import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { CommunityPanel } from "@/components/home/CommunityPanel";
import { FaqPanel } from "@/components/home/FaqPanel";
import { PlayerOfMonthPanel } from "@/components/home/PlayerOfMonthPanel";
import { GameCard } from "@/components/game/GameCard";
import { getHomeContent } from "@/lib/home/queries";
import {
  listPitchNamesByGame,
  listRostersByGame,
  listUpcomingGames,
} from "@/lib/games/queries";
import { groupByDay } from "@/lib/games/days";
import { getLocale } from "@/lib/i18n/server";
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
  const locale = await getLocale();

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
  // `now` comes back FROM the query layer, which is where the clock is read —
  // so the pills and the list agree about what "Today" means even across a
  // Prague midnight.
  const { games, now } = await listUpcomingGames(3);
  // The canonical card carries an avatar stack (§2.1, ruling D), so the home
  // preview needs the same roster read the list does — one round trip for all
  // three games rather than one apiece.
  const rosters = await listRostersByGame(games.map(({ game }) => game.id));
  // Pitch names, live from `venues` — see `listPitchNamesByGame`.
  const pitchNames = await listPitchNamesByGame(games.map(({ game }) => game));
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

      {/* NAV is the shared `chrome/Header`, rendered once from the root layout. */}

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
            {/*
              THE WORDMARK KEEPS ITS CAPITALS, and it is the one exception
              ruling B itself writes down: §1.4 marks the `hero` step "Upper
              (wordmark)". A brand set in caps is a logotype, not a heading
              shouting.

              ONE ROW AT EVERY WIDTH (Section 2, item 1). It was two, broken by
              a hard `<br>`; the line wins over the size, so the clamp's floor
              drops and `whitespace-nowrap` forbids a wrap the clamp cannot
              prevent on its own. `text-[clamp(30px,9vw,88px)]` still reaches
              the same 88px ceiling on a desktop — only the small end moves,
              which is exactly where the second row was coming from.
            */}
            <h1 className="m-0 whitespace-nowrap font-display text-[clamp(30px,9vw,88px)] uppercase leading-[0.92] tracking-[-1.5px] text-white">
              {landing.headlineLead} {landing.headlineAccent}
              <span className="text-volt">.</span>
            </h1>

            <div className="mt-4 text-hero-sub font-bold italic tracking-wide text-volt">
              {landing.heroSub}
            </div>

            {/*
              THE GREY SUB-LINE IS GONE (Section 2, item 2).

              `landing.vision` — "One match that repeats itself. Find a game,
              claim your spot, show up." — sat under the tagline and said what
              the three step cards below it say in more detail. The sentence
              splitting that solved its orphan problem goes with it; the helper
              is removed rather than left unused, because a dead helper is a
              render site nobody knows about.
            */}

            {/* Primary CTA — the games list, not an in-page anchor. */}
            <Link
              href="/games"
              className="mt-6 inline-flex items-center gap-[9px] rounded-control bg-volt px-[26px] py-[15px] text-cta font-extrabold tracking-wide text-surface no-underline"
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
                  className="lifted flex min-w-[200px] flex-1 items-start gap-3 rounded-card px-[18px] py-[15px] text-left"
                >
                  <div className="text-[14px] font-bold text-volt">
                    {step.index}
                  </div>
                  <div>
                    <div className="text-[18px] font-bold tracking-[.3px]">
                      {step.title}
                    </div>
                    <div className="mt-[3px] text-[13px] leading-[1.45] text-muted">
                      {step.body}
                    </div>
                  </div>
                </div>
              ))}
            </div>

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
              <h2 className="m-0 font-display text-section-title tracking-wide text-white">
                {landing.nextMatchesLabel}
              </h2>
            </div>

            {/*
              DAY HEADINGS ABOVE THE PILLS, as on the games page (Section 3,
              item 5). The pills no longer carry a date, so home needs the same
              structure or its three cards would say only a time — `18:30` with
              nothing to anchor it to a day.

              `groupByDay` is the games page's own helper, so the two surfaces
              label a day identically and cannot disagree about which evening a
              game belongs to.
            */}
            {games.length > 0 ? (
              <div data-testid="next-matches" className="flex flex-col gap-5">
                {groupByDay(games, ({ game }) => game.starts_at, now, t, locale).map(
                  (day) => (
                    <section key={day.key} data-testid="day-group" data-day={day.key}>
                      <h3
                        data-testid="day-heading"
                        className="m-0 mb-2 text-eyebrow font-semibold uppercase text-white"
                      >
                        {day.label}
                      </h3>
                      <div className="flex flex-col gap-3">
                        {day.items.map(({ game, bookedCount }) => (
                          <GameCard
                            key={game.id}
                            game={game}
                            bookedCount={bookedCount}
                            roster={rosters.get(game.id) ?? []}
                            supabaseUrl={supabaseUrl}
                            pitchName={pitchNames.get(game.id)}
                          />
                        ))}
                      </div>
                    </section>
                  ),
                )}
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
            COMMUNITY (now carrying the numbers) beside PLAYER OF THE MONTH,
            then the FAQ full width beneath — which is the SWAP of item 10.

            THE FAQ IS THE WIDE ONE. It holds six entries and was competing for
            a third of a row with a panel holding a name and a face; they have
            exchanged places, and the FAQ's six dropdowns sit 3 + 3 in two
            columns above `md`.

            THE STANDALONE STATS BOX IS GONE (item 8) — its two numbers moved
            into the community panel, which is where the invitation they
            support already lived.

            PLAYER OF THE MONTH SURVIVES RULING J by the amendment of
            2026-08-10, and keeps the hours-on-pitch stat that earns it the
            space the original ruling said it had not.
          */}
          <section className="pt-4">
            {/* `items-start`, so a panel is as tall as its own contents. */}
            <div className="flex flex-wrap items-start gap-4">
              <CommunityPanel
                gamesPerWeek={home.gamesPerWeek}
                activePlayers={home.activePlayers}
              />
              <PlayerOfMonthPanel
                player={home.playerOfMonth}
                supabaseUrl={supabaseUrl}
              />
            </div>

            <div className="mt-4">
              <FaqPanel />
            </div>
          </section>

          {/*
            FOOTER — MARK AND CITY ONLY.

            The tagline is gone from here because the HERO owns the slogan
            now: `heroSub` is "Come for the game, stay for the crew", and this
            printed the same sentence in tracked capitals two screens below it.
            One line said twice on one page is not emphasis, it is a page that
            has forgotten it already said it — and the hero is where a first-
            time visitor meets it.

            The links and the copyright are the SHARED `chrome/Footer` beneath
            this one, so "minimal footer: mark, links, ©" is satisfied across
            the two rather than by duplicating them here.
          */}
          <footer className="flex flex-wrap items-center gap-2 border-t border-hairline pb-6 pt-5">
            {/*
              WHITE, NOT GREY (item 11) — the volt accent on `FOTBAL` stays.
              The mark reading `muted` made the brand the quietest thing in
              its own footer.
            */}
            <div className="text-[14px] font-bold tracking-wide text-white">
              {landing.footer.wordmarkLead}{" "}
              <span className="text-volt-dim">
                {landing.footer.wordmarkAccent}
              </span>{" "}
              {landing.footer.city}
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}
