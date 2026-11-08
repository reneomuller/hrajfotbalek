"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import {
  INCLUDED_AMENITIES,
  PITCH_AMENITIES,
  type Amenity,
} from "@/lib/venues/amenities";
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
  const [errorCode, setErrorCode] = useState<string | null>(null);
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
    setErrorCode(null);
    startTransition(async () => {
      const supabase = createBrowserSupabaseClient();
      const { error: rpcError } = await supabase.rpc("set_venue_amenities", {
        p_venue_id: venueId,
        p_amenities: [...selected],
      });

      if (rpcError) {
        /*
         * NAME THE FAILURE, don't just report one.
         *
         * This swallowed `rpcError` entirely and showed one sentence for
         * every cause, which is how a missing migration spent a round
         * looking like a broken form: the function did not exist, PostgREST
         * answered 404, and the screen said "We could not save that."
         * Indistinguishable from a rejected amenity key, a lost session or a
         * venue that had been deleted underneath the page.
         *
         * The code goes onto the element as a data attribute so a spec and a
         * bug report can both quote it, and to the console so whoever is
         * looking at the screen has the message without opening the network
         * tab. The player-facing sentence is unchanged — this is an admin
         * surface, and the person reading it is the person who can act on a
         * code.
         */
        console.error("set_venue_amenities failed", rpcError);
        setErrorCode(rpcError.code ?? rpcError.message ?? "unknown");
        setError(strings.admin.venueAmenitiesFailed);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-small font-semibold text-bone">{strings.admin.venueAmenitiesTitle}</p>

      {/*
        TWO LABELLED GROUPS, matching the game page (Section 4, item 2). The
        admin picks from one array and always has; what changed is that the
        form now shows the same division the player sees, so an organizer is
        not guessing which heading a tick will land under.

        EACH BOX IS A CHIP (round 42, the admin rebuild) that takes a volt
        hairline when ticked, so the set reads at a glance. The checkbox stays
        a real, visible checkbox inside its label.
      */}
      {(
        [
          { title: strings.admin.venueAmenitiesIncluded, keys: INCLUDED_AMENITIES },
          { title: strings.admin.venueAmenitiesPitch, keys: PITCH_AMENITIES },
        ] as const
      ).map((group) => (
        <fieldset key={group.title} className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-2 p-0 text-[10px] uppercase tracking-eyebrow text-muted">
            {group.title}
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {group.keys.map((key) => (
              <label
                key={key}
                className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-control border border-hairline bg-surface px-3 text-[13px] text-bone transition-colors hover:border-hairline-strong has-[:checked]:border-hairline-volt has-[:checked]:text-white"
              >
                <input
                  type="checkbox"
                  data-testid={`amenity-${key}`}
                  checked={selected.has(key)}
                  onChange={() => toggle(key)}
                  className="shrink-0 accent-volt"
                />
                <span className="min-w-0">{strings.games.amenities[key]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          aria-busy={pending || undefined}
          data-testid="amenities-submit"
          className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-control bg-volt px-6 text-body-lg font-bold text-ink transition-colors hover:bg-volt-dim active:bg-volt-dim disabled:pointer-events-none disabled:bg-volt-dim disabled:opacity-90"
        >
          {pending && (
            <span
              aria-hidden
              className="h-4 w-4 shrink-0 animate-spin rounded-pill border-2 border-current border-t-transparent motion-reduce:animate-none"
            />
          )}
          {strings.admin.venueAmenitiesSubmit}
        </button>
        {saved && (
          <span data-testid="amenities-saved" role="status" className="text-small text-volt">
            {strings.admin.saved}
          </span>
        )}
      </div>

      {error && (
        <p
          role="alert"
          data-testid="amenities-error"
          data-error-code={errorCode ?? undefined}
          className="text-[12px] text-volt"
        >
          {error}
          {errorCode && (
            <span className="ml-2 font-mono text-[11px] text-muted">{errorCode}</span>
          )}
        </p>
      )}
    </div>
  );
}
