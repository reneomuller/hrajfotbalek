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
        THE DOTTED LINE AND THE LINEUP.

        THE RULE RENDERS UNCONDITIONALLY, and that is the correction: it was
        wrapped in `roster.length > 0`, so a game nobody had claimed showed the
        seam on its LIST card and not on its detail. The two surfaces have to
        be the same shape whether or not anyone has booked — "empty" is
        precisely when the arrangement needs to be legible, and a card that
        rearranges itself between zero and one player reads as two designs.

        The FACES still disappear at zero (§2.1): a ring drawn around nobody is
        a question. So at zero the rule closes the card under the capacity bar,
        which is exactly what the list card does.

        No caption either way — the spots figure and the bar are directly above
        at hero scale, and the full lineup with names is further down the page.
        This is the glance.
      */}
      <div className="mt-4 border-t border-dotted border-hairline-strong pt-4">
        {roster.length > 0 && (
          <AvatarRow players={roster} max={3} size="card" supabaseUrl={supabaseUrl} />
        )}
      </div>
    </section>
  );
}
