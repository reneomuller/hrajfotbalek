import { AvatarRow } from "@/components/game/AvatarRow";
import { strings } from "@/lib/strings";
import type { Database } from "@/lib/types/database";

type WaitlistRow = Database["public"]["Views"]["game_waitlist_public"]["Row"];

/**
 * The waiting list, in public.
 *
 * PII BOUNDARY — the second-highest-risk surface in the product, after the
 * roster. The rows come from `game_waitlist_public`, which projects `game_id`,
 * `nickname` and `position` and nothing else. This prop type is deliberately
 * narrowed to nickname + position so that even if the view were widened later,
 * no extra field could reach the rendered markup (and therefore the RSC
 * payload) without someone changing this type on purpose. Same guard the
 * `Roster` component carries, for the same reason.
 *
 * `viewerNickname` marks the viewer's own place in the queue. It comes from the
 * caller's own session — the view projects no player id, so "which of these is
 * me" is answerable only by matching a nickname. That is adequate for a ring
 * and a highlighted row, and is not relied on for anything else; the
 * authoritative answer to "am I on this list" is `isOnWaitlist`, which reads
 * the player's own row under RLS.
 *
 * Nicknames are player-supplied free text rendered as JSX children, escaped by
 * React.
 */
export function WaitlistPanel({
  rows,
  viewerNickname,
}: {
  rows: Pick<WaitlistRow, "nickname" | "position">[];
  viewerNickname?: string | null;
}) {
  return (
    <section className="mt-8" data-testid="waitlist-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="m-0 font-condensed text-[17px] font-bold uppercase tracking-wide text-white">
          {strings.games.waitlistTitle}
        </h2>
        {rows.length > 0 && (
          <span className="font-mono text-[10px] uppercase tracking-eyebrow text-volt-dim">
            {rows.length} {strings.games.waitlistCount}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 font-mono text-[11px] tracking-[1px] text-faint">
          {strings.games.waitlistEmpty}
        </p>
      ) : (
        <>
          <div className="mt-4 pl-2">
            <AvatarRow
              names={rows.map((row) => row.nickname)}
              highlight={viewerNickname}
              max={14}
            />
          </div>

          <ol className="mt-4 list-none space-y-px p-0">
            {rows.map((row) => {
              const isYou = viewerNickname != null && row.nickname === viewerNickname;
              return (
                <li
                  key={`${row.nickname}-${row.position}`}
                  data-testid={isYou ? "waitlist-row-you" : "waitlist-row"}
                  className={`flex items-center justify-between gap-3 border-b border-hairline py-[10px] last:border-b-0 ${
                    isYou ? "-mx-3 rounded-control bg-volt/[.06] px-3" : ""
                  }`}
                >
                  <span className="flex items-baseline gap-3">
                    <span className="font-mono text-[11px] tracking-[1px] text-volt-dim">
                      #{row.position}
                    </span>
                    <span className={`text-[14px] ${isYou ? "text-volt" : "text-bone"}`}>
                      {row.nickname}
                    </span>
                  </span>
                  {isYou && (
                    <span className="font-mono text-[10px] uppercase tracking-eyebrow text-volt">
                      {strings.games.waitlistYou}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          {/*
            Never render a position without this. Under notify-all FCFS the
            number says how many joined ahead, not who gets served first — and
            a queue that looks ordered but is not is worse than no number.
          */}
          <p className="mt-3 text-[12px] leading-snug text-muted-dim">
            {strings.games.waitlistHint}
          </p>
        </>
      )}
    </section>
  );
}
