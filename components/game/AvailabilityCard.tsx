import { AvatarRow } from "@/components/game/AvatarRow";
import { CapacityBar } from "@/components/game/CapacityBar";
import { SpotsLeft } from "@/components/game/SpotsLeft";
import { gameUrgency, urgencyLabel } from "@/lib/games/urgency";
import { getStrings } from "@/lib/i18n/server";
import type { RosterAvatar } from "@/lib/games/queries";

/**
 * How full the game is — the same FOMO element as the list row, at hero scale.
 *
 * WHAT IT REPLACES: an eyebrow, a `07/12` counter in 22px mono, a bar, a row of
 * fourteen avatars and a small "5 spots left" in muted grey. Five things, and
 * the one a player actually acts on was the smallest of them. The counter in
 * particular was the loudest and says the least — `07/12` is two numbers the
 * reader has to subtract before it means anything.
 *
 * So: the count first, in the colour it earns, then the bar in the same colour,
 * then `7 / 12 players` beneath as the supporting detail it always was. The
 * avatars moved to the players list, which is where a name goes with a face.
 *
 * `urgencyLabel` STAYS AS THE EYEBROW and is the proportional ladder, while the
 * count's colour is the absolute one — see `lib/games/urgency.ts`. They can
 * disagree on a large half-empty game, and that is recorded there as intended
 * rather than reconciled here.
 */
export async function AvailabilityCard({
  roster = [],
  supabaseUrl,
  bookedCount,
  capacity,
}: {
  bookedCount: number;
  capacity: number;
  /** Roster avatars for the glance stack. Empty renders no stack (§2.1). */
  roster?: RosterAvatar[];
  /** Storage origin for the photos; absent falls back to initials. */
  supabaseUrl?: string;
}) {
  const t = await getStrings();
  const urgency = gameUrgency(bookedCount, capacity);

  return (
    <section
      data-testid="availability-card"
      className="mt-4 rounded-card bg-surface p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] uppercase tracking-eyebrow text-muted">
          {t.games.availabilityLabel}
        </span>
        <span
          data-testid="urgency-label"
          className={` text-[10px] uppercase tracking-[2px] ${
            urgency === "full" ? "text-faint" : "text-volt-dim"
          }`}
        >
          {urgencyLabel(urgency, t)}
        </span>
      </div>

      {/*
        THE FIGURE AND THE FACES SHARE A ROW (redesign v2, round 4, p03).

        They were stacked with the capacity bar between them: figure, bar,
        faces. p03 puts the counter at the left and the avatar stack at the
        right of the SAME line, with the bar spanning underneath both — which
        is the list card's anatomy one size up, and saves a row on the fold.

        `flex-wrap` with the stack `shrink-0`: a long counter in Czech or
        Russian pushes the faces to their own line rather than squeezing them
        into overlapping slivers.
      */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <SpotsLeft bookedCount={bookedCount} capacity={capacity} size="hero" />
        {roster.length > 0 && (
          <span className="shrink-0">
            <AvatarRow players={roster} max={3} size="card" supabaseUrl={supabaseUrl} />
          </span>
        )}
      </div>

      <div className="mt-3">
        <CapacityBar bookedCount={bookedCount} capacity={capacity} />
      </div>

    </section>
  );
}
