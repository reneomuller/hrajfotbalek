import Link from "next/link";
import { GuestIcon } from "@/components/game/GuestIcon";
import { sortRoster, toRosterAvatar, type RosterAvatar } from "@/lib/games/queries";
import { guestLabel, isAnonymousGuest } from "@/lib/roster/guests";
import { initials } from "@/lib/roster/initials";
import { avatarUrl } from "@/lib/storage/avatar";
import { getLocale, getStrings } from "@/lib/i18n/server";
import { pluralise } from "@/lib/i18n/plural";
import type { Locale } from "@/lib/i18n/locales";
import type { Strings } from "@/lib/strings";
import type { Database } from "@/lib/types/database";

type RosterRow = Database["public"]["Views"]["game_roster_public"]["Row"];

export interface PlayersListProps {
  /**
   * ONE ROW PER SEAT since round 11, so a party of three arrives as three
   * entries and the heading's count is seats rather than bookings — which is
   * the number a reader wants: how many people will be on the pitch.
   */
  rows: Pick<
    RosterRow,
    "nickname" | "photo_path" | "games_played" | "is_guest" | "guest_of" | "guest_index"
  >[];
  /** Storage origin for the photos; absent means initials everywhere. */
  supabaseUrl?: string;
}

/**
 * The lineup: a face, a name, and how many games they have played.
 *
 * PII BOUNDARY — the single highest-risk surface in the product, and this
 * component is the second half of the mechanism. The rows arrive from
 * `game_roster_public`, which projects four columns and nothing else; the prop
 * type here is narrowed to the three it renders, so no additional field can
 * reach the markup — and therefore the RSC payload — without someone editing
 * this type on purpose. Migration 39 adding `games_played` is that mechanism
 * working as intended: the view gained a column under contract §4a, and
 * admitting it here was a deliberate edit rather than a widening that arrived
 * through a wildcard.
 *
 * THE GAMES COUNT IS WHY THIS REPLACED `Roster`. A roster of nicknames answers
 * "am I the only one" and nothing else. "Karl M · 27 games" answers the
 * question a new player is actually asking, which is whether these are people
 * who keep coming back — and it is the cheapest possible signal that this is a
 * group rather than a queue. It counts PLAYED and SETTLED games only; a counter
 * that rose when you booked would be measuring intent.
 *
 * THE BOOKING STATUS IS GONE from the row, deliberately. "Reserved" versus
 * "Confirmed" is the difference between having paid and not having paid yet,
 * which is nobody else's business on a public page and was never information
 * the reader could use. It survives where it belongs: on the admin roster.
 *
 * `nickname` is player-supplied and interpolated as a JSX text child, which
 * React escapes.
 */
export async function PlayersList({ rows, supabaseUrl }: PlayersListProps) {
  const t = await getStrings();
  const locale = await getLocale();

  // Sorted HERE and passed down, so the stack and the named list beneath it
  // agree about the order — and so the `+N` chip swallows the same tail in
  // both. `sortRoster` puts guests last.
  const seats = sortRoster(rows.map(toRosterAvatar));

  return (
    <section
      data-testid="players-list"
      className="mt-4 rounded-card bg-surface p-5"
    >
      {/* WHITE (Section 4, item 6) — this section label was grey. */}
      <h2 className="m-0 text-[10px] uppercase tracking-eyebrow text-white">
        {t.games.playersTitle.replace("{count}", String(rows.length))}
      </h2>

      {rows.length === 0 ? (
        /*
          §3: `Lineup (0)` renders the §2.9 empty state INLINE — one line, no
          action — "since the claim bar already carries the action". The copy
          changed with it: `be the first name on it` invited a tap this element
          has nothing to offer, and the bar two inches below it does.
        */
        <p data-testid="lineup-empty" className="mt-3 text-body text-muted">
          {t.games.rosterEmpty}
        </p>
      ) : (
        <>
          {/*
            ~~THE STACK — overlapping circles above the named list, the same
            `AvatarRow` the waiting-list panel uses (Section 4, item 5).~~
            REMOVED (round 16, item 5), and this is the one the owner meant.

            IT SAT DIRECTLY ABOVE A LIST OF THE SAME PEOPLE, in the same card,
            one showing their faces and the next showing their faces AND their
            names. Its own comment gave the game away: the named list "stays
            beneath, because it carries the games-played count" — which is an
            argument for the list, not for both.

            Round 14 item 13 made both clickable, so a roster of six became
            twelve links to six profiles, stacked.

            THE LIST WINS on the stack's own reasoning. Every row already
            begins with the avatar, so no face is lost; what goes is the second
            rendering of it. The other duplication — three faces beside the
            counter in `AvailabilityCard` — went with it in the same item.
          */}
          <ul className="mt-4 flex list-none flex-col p-0" data-testid="roster">
          {seats.map((seat, i) => (
            <li
              key={`${seat.guestOf ?? seat.nickname ?? "guest"}-${seat.guestIndex ?? 0}-${i}`}
              data-guest={seat.isGuest ? "true" : undefined}
              className="flex items-center gap-3 border-b border-hairline py-[10px] last:border-b-0"
            >
              {/*
                THE ROW OPENS THE PLAYER (round 14, item 13), and GUESTS DO NOT
                LINK. A guest is a seat rather than a person (R24), and a
                pre-round-11 shadow is somebody who never signed up — neither
                has a profile, and `public_player_profile` refuses both, so a
                link would be a 404 with a name on it.

                THE WHOLE NAME-AND-FACE IS THE TARGET rather than the avatar
                alone: a 34px circle is a small tap area, and the two are one
                object to a reader.
              */}
              {seat.isGuest || seat.isPending || !seat.nickname ? (
                <>
                  <Avatar seat={seat} supabaseUrl={supabaseUrl} index={i} />
                  <span className="min-w-0 flex-1 truncate text-[15px] text-muted">
                    {guestLabel(seat, t)}
                  </span>
                </>
              ) : (
                <Link
                  href={`/player/${encodeURIComponent(seat.nickname)}`}
                  data-testid="roster-player-link"
                  className="flex min-w-0 flex-1 items-center gap-3 no-underline"
                >
                  <Avatar seat={seat} supabaseUrl={supabaseUrl} index={i} />
                  <span className="min-w-0 flex-1 truncate text-[15px] text-bone">
                    {seat.nickname}
                  </span>
                </Link>
              )}
              {/*
                Rendered only when it is a real number — a null means the view
                could not count, which is not the same as zero.

                NEVER FOR A GUEST (round 11). "First game" beside a seat that
                is not a person reads as a fact about a player who does not
                exist, and the underlying count is structurally zero for every
                guest, so printing it would put the same welcome on every one
                of them.
              */}
              {/*
                NOR FOR A PENDING SEAT (round 25, item 1), and this one is
                worse than the guest case it borrows from: the view returns 0
                for a checkout in progress, so the chip read "First game"
                beside an anonymous row — a WRONG fact about a REAL player,
                published on the one row that is meant to say nothing about
                them. Caught in the strip rather than in an assertion, which is
                what the strips are for.
              */}
              {!seat.isGuest && !seat.isPending && typeof rows[i]?.games_played === "number" && (
                <span
                  data-testid="player-games-played"
                  data-count={rows[i]?.games_played ?? 0}
                  className="shrink-0 text-[12px] text-muted"
                >
                  {gamesPlayedLabel(rows[i]?.games_played ?? 0, locale, t)}
                </span>
              )}
            </li>
          ))}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * "27 games", "1 game", or "First game".
 *
 * THE ZERO CASE IS THE ONE THAT MATTERS. "0 games" beside someone standing in
 * their first lineup reads as a verdict on them; "First game" is the same fact
 * and reads as a welcome. The singular exists because "1 games" is the kind of
 * slip a reader notices and nothing else on the page recovers from.
 */
function gamesPlayedLabel(count: number, locale: Locale, t: Strings): string {
  if (count <= 0) return t.games.gamesPlayedNone;
  /*
   * `count === 1` decided this until round 22, which is right in English and
   * wrong from two upwards in the other three languages — Czech, Russian and
   * Ukrainian each take a 2-4 form, and a roster is full of players on their
   * second and third game.
   */
  return pluralise(
    {
      one: t.games.gamesPlayedOne,
      few: t.games.gamesPlayedFew,
      many: t.games.gamesPlayedMany,
    },
    count,
    locale,
  );
}

/**
 * The 34px avatar beside a name.
 *
 * `alt` is empty because the nickname is rendered immediately beside it — a
 * screen reader announcing both would read every player twice.
 */
async function Avatar({
  seat,
  supabaseUrl,
  index,
}: {
  seat: RosterAvatar;
  supabaseUrl?: string;
  index: number;
}) {
  const t = await getStrings();
  // A guest has no account and therefore no photograph. Not a fallback: there
  // is nothing to look up.
  const photo = supabaseUrl && !seat.isGuest ? avatarUrl(supabaseUrl, seat.photoPath) : null;

  return (
    <span
      data-testid="roster-avatar"
      className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-pill bg-surface-avatar text-[12px] font-bold ${
        !seat.isGuest && index % 3 === 0 ? "text-volt" : seat.isGuest ? "text-muted" : "text-bone"
      }`}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt=""
          data-testid="roster-avatar-photo"
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : isAnonymousGuest(seat) ? (
        <GuestIcon />
      ) : (
        initials(seat.nickname ?? "", t)
      )}
    </span>
  );
}
