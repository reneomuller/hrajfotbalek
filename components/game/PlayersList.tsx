import Link from "next/link";
import { AvatarRow } from "@/components/game/AvatarRow";
import { GuestIcon } from "@/components/game/GuestIcon";
import { sortRoster, toRosterAvatar, type RosterAvatar } from "@/lib/games/queries";
import { guestLabel, isAnonymousGuest } from "@/lib/roster/guests";
import { initials } from "@/lib/roster/initials";
import { avatarUrl } from "@/lib/storage/avatar";
import { getStrings } from "@/lib/i18n/server";
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
            THE STACK, AS THE WAITING LIST DRAWS ITS ENTRIES (Section 4, item
            5) — overlapping circles above the named list, the same
            `AvatarRow` that panel uses.

            WITH PHOTOS HERE, unlike the waitlist. That is not an
            inconsistency: §4a admitted `photo_path` to the ROSTER view and
            deliberately not to `game_waitlist_public`, so the waitlist passes
            null because it has nothing else to pass. This section has the
            column and uses it.

            The named list stays beneath, because it carries the games-played
            count — the thing that answers whether these are people who keep
            coming back, which a row of faces cannot.
          */}
          <div className="mt-3">
            <AvatarRow players={seats} supabaseUrl={supabaseUrl} max={14} linkProfiles />
          </div>

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
              {seat.isGuest || !seat.nickname ? (
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
              {!seat.isGuest && typeof rows[i]?.games_played === "number" && (
                <span
                  data-testid="player-games-played"
                  data-count={rows[i]?.games_played ?? 0}
                  className="shrink-0 text-[12px] text-muted"
                >
                  {gamesPlayedLabel(rows[i]?.games_played ?? 0, t)}
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
function gamesPlayedLabel(count: number, t: Strings): string {
  if (count <= 0) return t.games.gamesPlayedNone;
  if (count === 1) return t.games.gamePlayedOne;
  return t.games.gamesPlayed.replace("{count}", String(count));
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
      className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-avatar text-[12px] font-bold ${
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
