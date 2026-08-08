import { Icon } from "@/components/Icon";
import { FormatChips } from "@/components/game/FormatChips";
import { SharePair } from "@/components/game/SharePair";
import { SkillBadges } from "@/components/game/SkillBadges";
import { formatCzk, formatGameDate, formatTimeSpan } from "@/lib/format";
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
  shareUrl,
  shareWhen,
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
  shareUrl: string;
  shareWhen: string;
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
          THE PRICE, and this is where it went when it came off the list rows.

          It is here as well as on the sticky button, and the two are not a
          duplication: this states a FACT about the game, the button states a
          COMMITMENT. The distinction is load-bearing rather than stylistic —
          the button is absent for a full game, a cancelled game, a game that
          has kicked off and a player who already holds a spot, and without
          this line a signed-out visitor arriving at a full game from a shared
          link would find no price anywhere in the product. The reference does
          the same thing for the same reason.
        */}
        <span data-testid="game-price" className="text-[15px] text-muted">
          {formatCzk(game.price_czk)}
        </span>
      </div>

      {/* What kind. Format, substitutes, surface, and the skill badge only when
          the game is actually restricted (§5.3, REQ-GAME-009). Derived from
          capacity nowhere. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <FormatChips
          format={game.format}
          surface={game.surface}
          subsPerTeam={game.subs_per_team}
        />
        <SkillBadges levels={game.allowed_skill_levels} />
      </div>

      {game.allowed_skill_levels && (
        <p className="mt-3 font-mono text-small tracking-[1px] text-faint">
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
          className="flex min-h-11 items-center gap-2 font-condensed text-[15px] font-bold tracking-wide text-volt no-underline"
        >
          <Icon name="pin" className="h-[18px] w-[18px]" />
          {t.games.openMapFull}
        </a>

        {/* Copy link primary, WhatsApp secondary (§5.4, REQ-GAME-014). */}
        <div className="mt-1">
          <SharePair venue={game.venue} when={shareWhen} url={shareUrl} />
        </div>
      </div>
    </section>
  );
}
