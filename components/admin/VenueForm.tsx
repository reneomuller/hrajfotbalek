"use client";

import { useActionState } from "react";
import {
  createVenueAction,
  updateVenueAction,
  type VenueFormState,
} from "@/app/admin/venues/actions";
import { PendingButton } from "@/components/form/PendingButton";
import { strings } from "@/lib/strings";

const INITIAL: VenueFormState = { status: "idle" };

/**
 * Create a venue, or rename one and set where its map points.
 *
 * ONE COMPONENT FOR BOTH, switched on whether a `venue` is passed. The two
 * forms differ by one hidden field and which action they post to; two
 * components would be two places to add the next field to, and the create form
 * is the one that would be forgotten.
 *
 * THE PHOTO AND THE AMENITIES ARE NOT HERE. Both need an id to write against —
 * `set_venue_photo` returns a bucket key derived from it — so they render
 * beside this form on the EDIT surface only, which is also the honest order:
 * you cannot photograph a venue that does not exist yet.
 *
 * ENGLISH, like the rest of the panel (R22).
 */
export function VenueForm({
  venue,
}: {
  venue?: { id: string; name: string; map_query: string | null; pitch_name: string | null };
}) {
  const isEdit = venue !== undefined;
  const [state, formAction] = useActionState(
    isEdit ? updateVenueAction : createVenueAction,
    INITIAL,
  );

  return (
    <form action={formAction} data-testid={isEdit ? "venue-edit-form" : "venue-create-form"}>
      {isEdit && <input type="hidden" name="venueId" value={venue.id} />}

      <label className="field-label" htmlFor={`name-${venue?.id ?? "new"}`}>
        {strings.admin.venueNameLabel}
      </label>
      <input
        id={`name-${venue?.id ?? "new"}`}
        name="name"
        required
        maxLength={80}
        defaultValue={venue?.name ?? ""}
        data-testid="venue-name-input"
        className="field mt-1 w-full"
      />

      <label className="field-label mt-4 block" htmlFor={`map-${venue?.id ?? "new"}`}>
        {strings.admin.venueMapQueryLabel}
      </label>
      <input
        id={`map-${venue?.id ?? "new"}`}
        name="mapQuery"
        defaultValue={venue?.map_query ?? ""}
        data-testid="venue-map-input"
        className="field mt-1 w-full"
      />
      <p className="mt-1 text-[13px] text-muted">{strings.admin.venueMapQueryHint}</p>

      {/*
        THE PITCH NAME IS EDIT-ONLY. On a create form it is a field for a fact
        nobody has yet — the venue is being made because a game needs it, and
        which pitch is a later thought.
      */}
      {isEdit && (
        <>
          <label className="field-label mt-4 block" htmlFor={`pitch-${venue.id}`}>
            {strings.admin.pitchNameLabel}
          </label>
          <input
            id={`pitch-${venue.id}`}
            name="pitchName"
            defaultValue={venue.pitch_name ?? ""}
            data-testid="venue-pitch-input"
            className="field mt-1 w-full"
          />
          <p className="mt-1 text-[13px] text-muted">{strings.admin.venuePitchNameHint}</p>
        </>
      )}

      <div className="mt-4">
        <PendingButton
          label={isEdit ? strings.admin.venueSave : strings.admin.venueCreate}
          testId={isEdit ? "venue-save" : "venue-create"}
        />
      </div>

      {(state.status === "saved" || state.status === "created") && (
        <p data-testid="venue-saved" className="mt-3 text-[13px] text-volt">
          {state.status === "created" ? strings.admin.venueCreated : strings.admin.venueSaved}
        </p>
      )}
      {state.status === "error" && state.message && (
        <p role="alert" data-testid="venue-error" className="mt-3 text-[13px] text-bone">
          {state.message}
        </p>
      )}
    </form>
  );
}
