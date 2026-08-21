import type { Metadata } from "next";
import { ToastFromQuery } from "@/components/ToastFromQuery";
import { EmptyState } from "@/components/EmptyState";
import { DayPicker } from "@/components/game/DayPicker";
import { GameCard } from "@/components/game/GameCard";
import { NextGameStrip } from "@/components/game/NextGameStrip";
import { PassPanel } from "@/components/pass/PassPanel";
import { getOwnNextBooking } from "@/lib/booking/queries";
import { getSessionUser } from "@/lib/auth/session";
import { buildDayTabs, groupByDay, pragueDayKey, resolveSelectedDay } from "@/lib/games/days";
import {
  listPitchNamesByGame,
  listVenueImagesByGame,
  listRostersByGame,
  listUpcomingGames,
} from "@/lib/games/queries";
import { getLocale, getStrings } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStrings();
  return {
    title: t.games.listTitle,
    description: t.meta.description,
  };
}

// Capacity changes as people book, so the list is rendered per request rather
// than statically cached — a cached spots-left count is a wrong one.
export const dynamic = "force-dynamic";

/**
 * The games list — compact rows and a day picker (§5.5, v1.1.4).
 *
 * WHAT THIS PAGE STOPPED DOING, and why each one is a removal rather than a
 * regression:
 *
 *   - NO VENUE PHOTO PER ROW. v1.1.2 hoped the photo would help density; it
 *     does the opposite. The photo belongs to the detail page, where someone
 *     deciding about one game benefits from seeing the pitch.
 *   - NO ROSTER AVATARS PER ROW. Eight overlapping circles are three lines of
 *     vertical space spent on who else is coming, which is a question the
 *     detail page answers properly and a list cannot answer at all.
 *   - NO SHARE BUTTON PER ROW. Sharing is something you do to ONE game, and
 *     it was also the reason the card could not simply be a link.
 *   - NO CLAIM CTA (§5.6a). Rows say "View game". A CTA that books from a
 *     list is a CTA that books the wrong game, and it duplicated the
 *     already-booked logic across three surfaces.
 *
 * Two queries fewer as a direct consequence: the rosters and the venues are no
 * longer fetched here at all.
 *
 * The criterion is "well more than three games visible at Pixel-7 width", and
 * it is asserted by a spec that counts rows inside the viewport rather than
 * being eyeballed on a strip.
 */
export default async function GamesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getStrings();
  // The strip and the day headings format DATES, which the string table cannot
  // carry — they need the language itself, not a translated key.
  const locale = await getLocale();
  const query = searchParams ? await searchParams : {};
  /*
   * UNBOUNDED, and this is half of the invisible-truncation guarantee.
   *
   * `listUpcomingGames` defaults to 20, which is a second window on top of
   * the day filter's — a board with more than twenty upcoming games would
   * have dropped the furthest ones out of `All` silently. `All` means all.
   */
  const { games, now } = await listUpcomingGames(null);

  const signedIn = (await getSessionUser()) !== null;
  const [rosters, pitchNames, venueImages, nextOwn] = await Promise.all([
    /*
     * THE ROSTERS ARE BACK, and this is ruling D's cost rather than a
     * regression of the v1.1.4 removal. They were dropped because eight
     * overlapping circles per row were three lines of vertical space; §2.1
     * spends 28px on three of them and a `+N`, on the same line as the spots
     * figure, which costs nothing. One round trip for the whole page.
     */
    listRostersByGame(games.map(({ game }) => game.id)),
    listPitchNamesByGame(games.map(({ game }) => game)),
    listVenueImagesByGame(games.map(({ game }) => game)),
    // Own-row RLS makes this empty for a signed-out visitor, which is the
    // right answer — but skipping it saves a round trip on the anonymous
    // path, which is the common one from a shared link.
    signedIn ? getOwnNextBooking() : Promise.resolve(null),
  ]);

  // Storage origin for the avatar photos; absent, the stack falls back to
  // initials, which is the ordinary case rather than a failure.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  /*
   * "Your next game" needs the live count, which the strip shows; the booking
   * carries a game snapshot but not how full it is now. Reusing the list's
   * count when the game is on the list avoids a second query for a number
   * already in hand.
   */
  const nextOwnCount = nextOwn
    ? (games.find(({ game }) => game.id === nextOwn.game.id)?.bookedCount ?? 0)
    : 0;

  // `now` comes back FROM the query layer, which is where the clock is read —
  // and it is the same instant `hasStarted` was computed from, so a game and
  // the tab it sits under cannot be labelled from two different days.
  const dayTabs = buildDayTabs(
    games.map(({ game }) => game.starts_at),
    now,
    locale,
    t,
  );
  const requested = typeof query.day === "string" ? query.day : undefined;
  const selectedDay = resolveSelectedDay(requested, dayTabs);

  /*
   * EVERY UPCOMING GAME BY DEFAULT, chronological, grouped under a day heading.
   *
   * `selectedDay` is null unless the URL asks for one, so the strip narrows
   * this rather than defining it. The previous version defaulted to the first
   * day and offered no way back to the whole list — which meant a game two
   * days out could not be seen at all, and a skill badge on one of those rows
   * read as a rendering bug rather than as a hidden row.
   */
  const visible = selectedDay
    ? games.filter(({ game }) => pragueDayKey(game.starts_at) === selectedDay)
    : games;

  const grouped = groupByDay(visible, ({ game }) => game.starts_at, now, t, locale);

  return (
    <main className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-16">
      {/*
        ~~The page title, `page-title`, the step p02 draws.~~ REMOVED (round 13,
        item 16).

        The tab that got here is already called Games and is still lit in the
        nav pill two inches below; the day strip under this said which day. A
        heading repeating the tab name is the largest type on the page spent on
        the one fact the reader cannot have arrived without knowing.

        THE `<h1>` GOES WITH IT RATHER THAN BEING HIDDEN. A visually-hidden
        heading would keep the document outline and cost nothing — but the page
        has a real one now: the day group heads the list, and `groupByDay`
        renders those. An empty `<h1>` above them would be a second, competing
        outline root.
      */}

      {nextOwn && (
        <div className="mt-2">
          {/*
            ~~The same roster and pitch name the list rows get — the strip IS
            a `GameCard` now, so withholding them would draw the same game
            with a missing avatar stack directly above one that has it.~~

            IT IS A BANNER SINCE ROUND 13 (item 17): a row of four facts at the
            Game Pass promo's dimensions, not a card. No roster, no photo — it
            takes the venue, the count and the pitch name and nothing else.
          */}
          <NextGameStrip
            game={nextOwn.game}
            bookedCount={nextOwnCount}
            pitchName={pitchNames.get(nextOwn.game.id)}
          />
        </div>
      )}

      {/*
        THE RHYTHM, TOP TO BOTTOM (round 14, item 6).

        `pt-24` was sized for a page with a title in it. With the title gone
        (round 13, item 16) it left a hand's width of nothing under the header,
        so the content comes UP to `pt-16`.

        And the three blocks below get room to be three blocks: the day strip,
        the pass banner and the first game box were `mt-4 / mt-4 / mt-3`, which
        at this density read as one undifferentiated stack. `mt-6` between each
        is the noticeable step the item asks for, spent where it separates
        things that are actually different rather than at the top of the page
        where it separated nothing from nothing.
      */}
      <DayPicker tabs={dayTabs} selected={selectedDay} allLabel={t.games.dayFilterAll} />

      {/* Between the day-picker and the list, per §4.2. Someone scanning for a
          game is the person for whom pre-buying games is worth anything. */}
      <div className="mt-6">
        <PassPanel />
      </div>

      {games.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={t.games.emptyTitle}
            body={t.games.emptyBody}
            ctaLabel={t.games.emptyCta}
            ctaHref={t.landing.community.whatsappUrl}
          />
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-5" data-testid="game-list">
          {grouped.map((day) => (
            <section key={day.key} data-testid="day-group" data-day={day.key}>
              {/* The heading carries the date as well as the relative word:
                  "Today" alone stops meaning anything once you have scrolled
                  past it. */}
              {/* The one uppercase style the product has (ruling B): a small
                  grey eyebrow, on the token rather than a loose 10px. */}
              <h2
                data-testid="day-heading"
                /*
                  WHITE, not `faint` (Section 3, item 3) — these headings are
                  the only thing carrying the DATE.

                  AND `body-lg`, NOT `eyebrow` (round 14, item 4). Every group
                  always HAD a heading; the owner reported that days beyond
                  today and tomorrow were missing one, and what he was reading
                  is real: at 11px with 3px tracking, "TODAY · MON 24 AUG"
                  still reads as a header because the word anchors it, and a
                  bare "MON 7 SEPT" reads as a caption on the box beneath.

                  So every date group now gets the SAME treatment, and it is
                  the section language the rest of the product uses — the same
                  `body-lg` white heading as "What's included" and "Game
                  information". A header that only looks like one when it says
                  "Today" is not a header.
                */
                className="m-0 mb-3 text-body-lg font-semibold text-white"
              >
                {day.label}
              </h2>
              <div className="flex flex-col gap-3">
                {day.items.map(({ game, bookedCount }) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    bookedCount={bookedCount}
                    roster={rosters.get(game.id) ?? []}
                    supabaseUrl={supabaseUrl}
                    pitchName={pitchNames.get(game.id)}
                    venueImagePath={venueImages.get(game.id) ?? null}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Signed in, or arrived from a cancellation. */}
      <ToastFromQuery query={query} />
    </main>
  );
}
