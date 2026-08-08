"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { AMENITIES, type Amenity } from "@/lib/venues/amenities";
import { strings } from "@/lib/strings";

/**
 * What this pitch provides — the checkboxes behind the game page's "What's
 * included" grid.
 *
 * ON THE GAME SURFACE, beside the photo upload, and for the same reason: "this
 * pitch has showers" is a thought an organizer has while looking at a game, not
 * while browsing a venue list there isn't one of. It writes to the VENUE, so
 * every game at that pitch gets it, and the heading says so.
 *
 * IT SAVES THE WHOLE SET, not a delta. `set_venue_amenities` replaces rather
 * than merges, because unticking a box is the operation that matters most — the
 * moment a pitch stops lending gloves is exactly when the page must stop
 * promising them, and a merge-shaped RPC would make that impossible to express.
 *
 * The labels come from the PLAYER-facing table rather than an admin one. An
 * admin ticking "Goalkeeper gloves" should be reading the words the player will
 * read; two tables here is how the checkbox says one thing and the page says
 * another.
 *
 * Admin chrome copy is English only — see `lib/i18n/locales.ts`.
 */
export function VenueAmenities({
  venueId,
  current,
}: {
  venueId: string;
  current: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(current));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function toggle(key: Amenity) {
    setSaved(false);
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const supabase = createBrowserSupabaseClient();
      const { error: rpcError } = await supabase.rpc("set_venue_amenities", {
        p_venue_id: venueId,
        p_amenities: [...selected],
      });

      if (rpcError) {
        setError(strings.admin.venueAmenitiesFailed);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {AMENITIES.map((key) => (
          <label
            key={key}
            className="flex min-h-11 cursor-pointer items-center gap-2 text-[13px] text-bone"
          >
            <input
              type="checkbox"
              checked={selected.has(key)}
              onChange={() => toggle(key)}
              data-testid={`amenity-${key}`}
              className="h-4 w-4 accent-volt"
            />
            {strings.games.amenities[key]}
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          data-testid="amenities-submit"
          className="w-fit rounded-control bg-volt px-5 py-3 font-condensed text-[15px] font-extrabold uppercase tracking-wide text-surface disabled:opacity-60"
        >
          {pending ? strings.common.loading : strings.admin.venueAmenitiesSubmit}
        </button>
        {saved && (
          <span data-testid="amenities-saved" className="text-[13px] text-volt">
            {strings.admin.saved}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="text-[12px] text-volt">
          {error}
        </p>
      )}
    </div>
  );
}
