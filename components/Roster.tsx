import { getStrings } from "@/lib/i18n/server";
import { initials } from "@/lib/roster/initials";
import { avatarUrl } from "@/lib/storage/avatar";
import type { Database } from "@/lib/types/database";

type RosterRow = Database["public"]["Views"]["game_roster_public"]["Row"];

export interface RosterProps {
  rows: Pick<RosterRow, "nickname" | "status" | "photo_path">[];
  /** Storage origin for the photos; absent means initials everywhere. */
  supabaseUrl?: string;
}

/**
 * Public lineup.
 *
 * PII BOUNDARY — the single highest-risk surface in the product. The rows
 * arrive from `game_roster_public`, which projects `game_id`, `nickname`,
 * `status` and `photo_path` and nothing else. This component's prop type is
 * deliberately narrowed to the three it renders, so no additional field can
 * reach the markup — and therefore the RSC payload — without someone changing
 * this type on purpose.
 *
 * PHASE 15 IS THAT MECHANISM WORKING AS INTENDED: the view gained a column
 * under contract §4a, and admitting it here was an edit somebody had to make
 * deliberately rather than a widening that arrived through a wildcard.
 *
 * `nickname` is player-supplied and is interpolated as a JSX text child, which
 * React escapes.
 */
export async function Roster({ rows, supabaseUrl }: RosterProps) {
  const t = await getStrings();
  return (
    <section className="mt-8">
      <h2 className="m-0 font-condensed text-[17px] font-bold uppercase tracking-wide text-white">
        {t.games.rosterTitle}
      </h2>

      {rows.length === 0 ? (
        <p className="mt-3 font-mono text-[11px] tracking-[1px] text-faint">
          {t.games.rosterEmpty}
        </p>
      ) : (
        <ul className="mt-3 flex list-none flex-col gap-px p-0" data-testid="roster">
          {rows.map((row, i) => (
            <li
              key={`${row.nickname}-${i}`}
              className="flex items-center justify-between gap-3 border-b border-hairline py-[10px] last:border-b-0"
            >
              <span className="flex items-center gap-3 text-[14px] text-bone">
                <RosterAvatarDot
                  nickname={row.nickname}
                  photoPath={row.photo_path}
                  supabaseUrl={supabaseUrl}
                  index={i}
                />
                {row.nickname}
              </span>
              <span
                className={`font-mono text-[10px] uppercase tracking-eyebrow ${
                  row.status === "confirmed" ? "text-volt" : "text-faint"
                }`}
              >
                {row.status === "confirmed"
                  ? t.games.rosterConfirmed
                  : t.games.rosterReserved}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The 28px avatar beside a name in the lineup list.
 *
 * Separate from `AvatarRow`, which stacks overlapping circles: this one sits
 * inline at list scale and needs no ring, no overflow chip and no highlight.
 * Sharing a component between the two would mean a prop for every difference.
 *
 * `alt` is empty because the nickname is rendered immediately beside it — a
 * screen reader announcing both would read every player twice.
 */
async function RosterAvatarDot({
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
      className={`flex h-[28px] w-[28px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-avatar font-condensed text-[11px] font-bold ${
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
