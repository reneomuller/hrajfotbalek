import { Icon } from "@/components/Icon";
import { CardBadges } from "@/components/game/CardBadges";
import { SkillBadges } from "@/components/game/SkillBadges";
import { formatGameDate, formatTimeSpan } from "@/lib/format";
import { LanguagePill } from "@/components/game/LanguagePill";
import { resolveDurationMinutes } from "@/lib/games/duration";
import { gameLanguageOf } from "@/lib/games/language";
import { effectivePitchName, venueDisplayName } from "@/lib/venues/displayName";
import { getStrings } from "@/lib/i18n/server";
import type { Database } from "@/lib/types/database";

type VenueRow = Database["public"]["Tables"]["venues"]["Row"];
type GameRow = Database["public"]["Tables"]["games"]["Row"];

/**
 * When, what kind, and how to get there — one card under the hero.
 *
 * THIS IS THE CONSOLIDATION. The same facts used to be four separate things
 * down the page: a chip row under the heading, a venue panel with its own map
 * button 200px below, a share pair near the bottom, and a "practical info"
 * list under that. A player deciding whether to come had to assemble the
 * answer from four places, and the map button — the one thing they need
 * standing outside — was the furthest from the top.
 *
 * ICONS CARRY THE KIND OF FACT, not decoration: a calendar before a date and a
 * clock before a span mean the reader does not have to parse which number is
 * which. They are the shared `Icon` set at one weight, which is what stops a
 * row of glyphs looking assembled from different places.
 *
 * ESCAPING: `venue`, `map_query` and the format are admin-supplied free text.
 * The chips interpolate as JSX children (React escapes); the maps URL runs its
 * query through `encodeURIComponent`.
 */
/**
 * The label column's treatment, named once so the four rows cannot drift. The
 * product's one uppercase style (ruling B), at the size the dashboard's tile
 * labels use.
 */
const FACT_LABEL = "m-0 pt-[2px] text-[10px] uppercase tracking-eyebrow text-muted";

export async function InfoCard({
  game,
  venueRow,
  endsAt,
}: {
  game: Pick<
    GameRow,
    | "venue"
    | "starts_at"
    | "price_czk"
    | "format"
    | "surface"
    | "subs_per_team"
    | "allowed_skill_levels"
    | "duration_minutes"
    | "pitch_name"
  > & {
    /** Round 18 item 3. Optional until the migration lands — see
     *  `gameLanguageOf`, which turns absence into the column's own default. */
    language?: unknown;
  };
  /*
   * `pitch_name` JOINS `map_query` (round 14, item 12): the Where row names
   * the ground and its pitch, through the same `venueDisplayName` the card and
   * the hero use, so three surfaces cannot spell one place three ways.
   */
  venueRow: Pick<VenueRow, "map_query" | "pitch_name"> | null;
  endsAt: Date;
}) {
  const t = await getStrings();

  const mapHref = `https://maps.google.com/?q=${encodeURIComponent(
    venueRow?.map_query || game.venue,
  )}`;

  return (
    <section
      data-testid="game-info-card"
      className="mt-4 rounded-card bg-surface p-5"
    >
      {/*
        A HEADING, AT LAST (round 13, item 14).

        This card carried the game's when, where, format, surface and level
        with NO LABEL AT ALL, directly under the hero — so the one block on the
        page that answers "what is this game" was the only one a reader could
        not name. "What's included" and "Pitch amenities" beneath it both have
        one, in exactly this treatment, which made the unlabelled card read as
        a preamble rather than a section.

        IT WAS ALREADY ABOVE "What's included" in the source, and it stays
        there — the item's ordering half was already satisfied. What was
        missing was the presentation that makes the order legible.
      */}
      <h2 className="m-0 mb-4 text-body-lg font-semibold text-white">
        {t.games.gameInfoTitle}
      </h2>

      {/*
        A LABELLED FACT LIST (round 14, item 12), which is the third go at this
        card and the first that matches the page it is on.

        ~~Two icon chips for the date and the time, then a loose row of badges,
        then a hairline.~~ Nothing was LABELLED: the format and surface badges
        floated with no word saying what they were, and the reader had to infer
        "6v6" and "Turf" were the same kind of fact as the clock beside them.

        THE QUALITY BAR IS THE DASHBOARD AND FINANCIALS, and both are built the
        same way — a quiet eyebrow label over a strong value, in rows. That is
        the language this card now speaks, so a reader scanning down the page
        meets one pattern rather than four.

        `dl`, NOT DIVS. These are literally terms and their definitions, the
        element exists, and a screen reader announces the pairing for free.
        Grid rather than the default flow so the values line up in a column —
        an unaligned definition list reads as a paragraph.
      */}
      <dl className="m-0 grid grid-cols-[84px_1fr] gap-x-4 gap-y-3">
        <dt className={FACT_LABEL}>{t.games.infoWhen}</dt>
        <dd className="m-0 text-[15px] text-white">
          {formatGameDate(game.starts_at)}
          <span data-testid="game-time-span" className="mt-[2px] block text-small text-muted">
            {formatTimeSpan(game.starts_at, endsAt)}
          </span>
        </dd>

        {/*
          ~~WHERE — the venue, joined to its pitch name.~~ IT IS THE LANGUAGE
          ROW NOW (round 18, item 3), and the swap costs nothing.

          THE ROW WAS THE `<h1>` AGAIN. `GameHero` is already passed
          `venueDisplayName(game.venue, pitchName)` — the same string this
          rendered, pitch name and all — so a reader met the venue in
          display type at the top of the page and then again as a fact
          eighty pixels below it. The map link directly under this list
          answers the part of "where" that a name cannot.

          WHAT REPLACES IT IS THE FACT NOBODY COULD GET ANYWHERE ELSE. Which
          languages are spoken decides whether a player can turn up alone and
          be understood, and until this round the product never said.
        */}
        <dt className={FACT_LABEL}>{t.games.infoLanguage}</dt>
        <dd className="m-0 flex items-center">
          <LanguagePill language={gameLanguageOf(game.language)} />
        </dd>

        {/*
          FORMAT AND LEVEL ARE TWO ROWS, not one line of mixed badges. A
          restricted game's level is the fact on this card that changes what a
          reader may do; sharing a row with the format made it a decoration
          beside one.
        */}
        {/*
          THE ROW IS CONDITIONAL, and finding out why is worth the line.

          `CardBadges` returns null when a game has neither a format nor a
          surface, and `subs_per_team` is usually null — so on such a game this
          rendered the word FORMAT with an empty box beside it. A definition
          list with a term and no definition is the "Meeting point: —" problem
          the old practical card was careful to avoid, arriving through a
          different door: there the placeholder was written on purpose and
          removed, here it was the absence of a guard.

          It still matters after item 10 made surface required. That rule binds
          new saves; games created before tonight can carry neither.
        */}
        {(game.format || game.surface || game.subs_per_team !== null) && (
          <>
            <dt className={FACT_LABEL}>{t.games.infoFormat}</dt>
            <dd className="m-0 flex flex-wrap items-center gap-2">
              <CardBadges format={game.format} surface={game.surface} />
              {game.subs_per_team !== null && (
                <span data-testid="game-subs" className="text-small text-muted">
                  {t.games.subsPerTeam.replace("{count}", String(game.subs_per_team))}
                </span>
              )}
            </dd>
          </>
        )}

        {/*
          SURFACE IS A ROW OF ITS OWN HERE, because it left the list card
          (round 18, item 2). Two secondary pills beside the format badge is
          one more than a 390px row carries, and the card kept the one that
          decides whether somebody taps. The fact is not lost — this list has
          room to state it in words.
        */}
        {game.surface && (
          <>
            <dt className={FACT_LABEL}>{t.games.infoSurface}</dt>
            <dd data-testid="game-surface-row" className="m-0 text-[15px] text-white">
              {t.games.surface[game.surface]}
            </dd>
          </>
        )}

        {game.allowed_skill_levels && (
          <>
            <dt className={FACT_LABEL}>{t.games.infoLevel}</dt>
            <dd className="m-0">
              <SkillBadges levels={game.allowed_skill_levels} />
            </dd>
          </>
        )}

        {/*
          DURATION, MOVED UP FROM "Practical information" (round 16, item 4).

          It belongs beside When and Where: how long a game runs is a fact of
          the fixture, in the same class as when it starts and what format it
          is, and it was 400px further down in a card of its own.

          `resolveDurationMinutes` rather than the raw column, so a game
          created before `duration_minutes` existed reads the policy default
          instead of rendering nothing.
        */}
        <dt className={FACT_LABEL}>{t.games.infoDuration}</dt>
        <dd data-testid="game-duration" className="m-0 text-[15px] text-white">
          {t.games.practicalDurationValue.replace(
            "{minutes}",
            String(resolveDurationMinutes(game.duration_minutes)),
          )}
        </dd>
      </dl>

      {/*
        THE ARRIVAL LINE, AND IT IS NOT A FACT ROW (round 16, item 4).

        Everything in the list above answers "what is this game". This one
        tells the reader to do something, and putting an instruction in the
        `dl` would make it the definition of a term that is not a term. It sits
        under the rule as a note, which is also where the eye lands last on the
        card — the right place for the thing you act on after you have decided
        to come.
      */}
      <p
        data-testid="game-arrival"
        className="mt-4 border-t border-hairline pt-3 text-[14px] leading-relaxed text-bone"
      >
        {t.games.practicalArrival}
      </p>

      {/*
        ~~NO PRICE HERE (v1.3 §3), and the reasoning survives the restyle.~~
        The claim bar is present in all seven states and carries the figure in
        five; the two it does not are the two where the player's own money has
        replaced it. So the fact is never missing, and stating it twice on one
        screen is what it always would have been without that gap.

        ~~"All welcome — this is a guide, not a rule."~~ Removed round 13 item
        12: the badges say which levels a game is pitched at, and a caption
        explaining that a badge is not a gate apologises for the element above
        it. The rule is unchanged — `create_booking` never consults skill.
      */}

      {/* How to get there, and how to tell someone else. Both are things you do
          with the game rather than facts about it, so they sit together below
          the hairline. */}
      <div className="mt-4 border-t border-hairline pt-4">
        <a
          href={mapHref}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="venue-open-map"
          className="flex min-h-11 items-center gap-2 text-[15px] font-bold tracking-wide text-volt no-underline"
        >
          <Icon name="pin" className="h-[18px] w-[18px]" />
          {t.games.openMapFull}
        </a>

        {/*
          WHATSAPP ONLY, AND IT MOVED (v1.3 §3: "No `Copy link`", and share sits
          below `Good to know`, not in the info card).

          Copy link was the PRIMARY share on the reasoning that a copied link
          goes wherever the sender is already talking. True, and beside the
          point at 390px: two share controls in a card whose job is to state
          when and where the game is made the card about sharing. The one
          destination that actually carries these links is the WhatsApp group
          the product exists to replace, and the browser's own share sheet is
          behind it for everywhere else.
        */}
      </div>
    </section>
  );
}
