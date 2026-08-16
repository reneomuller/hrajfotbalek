import { AvatarRow } from "@/components/game/AvatarRow";
import { initials } from "@/lib/roster/initials";
import { avatarUrl } from "@/lib/storage/avatar";
import { getStrings } from "@/lib/i18n/server";
import type { Strings } from "@/lib/strings";
import type { Database } from "@/lib/types/database";

type RosterRow = Database["public"]["Views"]["game_roster_public"]["Row"];

export interface PlayersListProps {
  rows: Pick<RosterRow, "nickname" | "photo_path" | "games_played">[];
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
            <AvatarRow
              players={rows.map((row) => ({
                nickname: row.nickname,
                photoPath: row.photo_path,
              }))}
              supabaseUrl={supabaseUrl}
              max={14}
            />
          </div>

          <ul className="mt-4 flex list-none flex-col p-0" data-testid="roster">
          {rows.map((row, i) => (
            <li
              key={`${row.nickname}-${i}`}
              className="flex items-center gap-3 border-b border-hairline py-[10px] last:border-b-0"
            >
              <Avatar
                nickname={row.nickname}
                photoPath={row.photo_path}
                supabaseUrl={supabaseUrl}
                index={i}
              />
              <span className="min-w-0 flex-1 truncate text-[15px] text-bone">
                {row.nickname}
              </span>
              {/*
                Rendered only when it is a real number — a null means the view
                could not count, which is not the same as zero.
              */}
              {typeof row.games_played === "number" && (
                <span
                  data-testid="player-games-played"
                  data-count={row.games_played}
                  className="shrink-0 text-[12px] text-muted"
                >
                  {gamesPlayedLabel(row.games_played, t)}
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
  nickname,
  photoPath,
  supabaseUrl,
  index,
}: {
  nickname: string;
  photoPath: string | null;
  supabaseUrl?: string;
  index: number;
}) {
  const t = await getStrings();
  const photo = supabaseUrl ? avatarUrl(supabaseUrl, photoPath) : null;

  return (
    <span
      data-testid="roster-avatar"
      className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-avatar text-[12px] font-bold ${
        index % 3 === 0 ? "text-volt" : "text-bone"
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
      ) : (
        initials(nickname, t)
      )}
    </span>
  );
}
