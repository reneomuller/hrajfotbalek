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

      <div className="mt-3">
        <SpotsLeft bookedCount={bookedCount} capacity={capacity} size="hero" />
      </div>

      <div className="mt-3">
        <CapacityBar bookedCount={bookedCount} capacity={capacity} />
      </div>

      {/*
        THE DOTTED PLAYER-COUNT LINE, WITH THE LINEUP BENEATH IT.

        Identical to the list card's arrangement (layout law, 2026-08-10) —
        that is the whole requirement: a reader who scanned the list on faces
        meets the same shape one tap later, rather than re-learning it. The
        avatars were beside the count here; they sit under it now, and the
        rule is dotted so it reads as a seam inside one card.

        The full lineup is still further down with names and games-played
        counts. This is the glance.
      */}
      <div className="mt-4 border-t border-dotted border-hairline-strong pt-4">
        <p data-testid="players-count" className="m-0 text-[14px] text-muted">
          {t.games.playersOfCapacity
            .replace("{booked}", String(Math.min(bookedCount, capacity)))
            .replace("{capacity}", String(capacity))}
        </p>

        {roster.length > 0 && (
          <div className="mt-2">
            <AvatarRow players={roster} max={3} size="card" supabaseUrl={supabaseUrl} />
          </div>
        )}
      </div>
    </section>
  );
}
