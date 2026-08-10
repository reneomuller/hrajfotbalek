import { Icon } from "@/components/Icon";
import { CardBadges } from "@/components/game/CardBadges";
import { SkillBadges } from "@/components/game/SkillBadges";
import { formatGameDate, formatTimeSpan } from "@/lib/format";
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
  >;
  venueRow: Pick<VenueRow, "map_query"> | null;
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
      {/* When. The SPAN, not the kick-off alone (§5.2, REQ-GAME-007) — the end
          comes from `gameEndsAt`, the same call the `.ics` DTEND and the
          schema.org endDate make, so the page cannot disagree with the calendar
          entry a player downloads from it. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="flex items-center gap-2 text-[15px] text-white">
          <Icon name="calendar" className="h-[18px] w-[18px] text-volt" />
          {formatGameDate(game.starts_at)}
        </span>
        <span
          data-testid="game-time-span"
          className="flex items-center gap-2 text-[15px] text-white"
        >
          <Icon name="clock" className="h-[18px] w-[18px] text-volt" />
          {formatTimeSpan(game.starts_at, endsAt)}
        </span>
        {/*
          NO PRICE HERE ANY MORE (v1.3 §3: "No price in the info card").

          The line that stood here was justified by a real gap: the price was
          on the claim button, and the button was ABSENT for a full game, a
          cancelled game, a started game and a holder — so without this a
          signed-out visitor arriving at a full game from a shared link found
          no price anywhere in the product.

          RULING G DISSOLVED THAT ARGUMENT RATHER THAN OVERRULING IT. The claim
          bar is now present in all seven states and carries the figure in five
          of them; the two it does not are the two where the player's own money
          has replaced it (`Paid`, `200 CZK due`), which is a better answer than
          the price. So the fact is never missing, and stating it twice on one
          screen is what it always would have been without the gap.
        */}
      </div>

      {/* What kind. Format, substitutes, surface, and the skill badge only when
          the game is actually restricted (§5.3, REQ-GAME-009). Derived from
          capacity nowhere. */}
      {/*
        THE SAME BADGE TREATMENT AS THE LIST CARD (ruling 6, 2026-08-10) —
        semi-transparent fill, solid coloured outline. `FormatChips` drew the
        format as a SOLID volt chip here and the surface as a bare outline,
        which is a third styling of the same two facts.

        Substitutes stay as `FormatChips` handled them — plain text beside the
        badges, and only when the organizer set a number (§5.3a).
      */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <CardBadges format={game.format} surface={game.surface} />
        {game.subs_per_team !== null && (
          <span data-testid="game-subs" className="text-small text-muted">
            {t.games.subsPerTeam.replace("{count}", String(game.subs_per_team))}
          </span>
        )}
        <SkillBadges levels={game.allowed_skill_levels} />
      </div>

      {game.allowed_skill_levels && (
        <p className="mt-3 text-small tracking-[1px] text-faint">
          {t.games.skillNotEnforced}
        </p>
      )}

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
