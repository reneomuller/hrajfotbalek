import { strings } from "@/lib/strings";
import type { GameStatus } from "@/lib/types/database";

/**
 * A game's status as a chip (round 42, the admin rebuild) — the AdminNav's
 * pill at a smaller size, toned by what the state asks of the organizer: volt
 * while the game is live, bone once it is played and needs settling, quiet once
 * it is settled, danger when it is off.
 *
 * THE TEXT IS THE STATUS WORD AND NOTHING ELSE. `admin.spec.ts` reads it as
 * exactly "Settled" off `admin-game-status`; a prefix or an icon in the text
 * would fail it.
 */
const TONE: Record<GameStatus, string> = {
  draft: "border-hairline text-faint",
  published: "border-hairline-volt text-volt",
  full: "border-volt text-volt",
  played: "border-hairline-strong text-bone",
  settled: "border-hairline text-muted",
  cancelled: "border-danger/40 text-danger",
};

export function StatusChip({ status, testId }: { status: GameStatus; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-pill border px-[10px] py-[3px] text-[10px] uppercase tracking-eyebrow ${TONE[status]}`}
    >
      {strings.admin.status[status]}
    </span>
  );
}
