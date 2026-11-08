"use client";

import { useActionState } from "react";
import {
  createVenueAction,
  updateVenueAction,
  type VenueFormState,
} from "@/app/admin/venues/actions";
import { Icon } from "@/components/Icon";
import { PendingButton } from "@/components/form/PendingButton";
import { strings } from "@/lib/strings";
import { VenuePhotoUpload } from "@/components/admin/VenuePhotoUpload";

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
 * TWO SHAPES (round 42, the admin rebuild). The create form spans the page, so
 * from `md` its fields sit two to a row; the edit form lives in one column of
 * an open venue's card and stays stacked.
 *
 * ENGLISH, like the rest of the panel (R22).
 */
export function VenueForm({
  venue,
  canSetAddress = false,
  mapHref = null,
}: {
  venue?: {
    id: string;
    name: string;
    map_query: string | null;
    pitch_name: string | null;
    /** Round 42 — absent on a database without `20261106110000`. */
    address?: string | null;
  };
  /** Round 42 — whether `set_venue_address` exists yet. */
  canSetAddress?: boolean;
  /**
   * Where the saved map field opens — the player's own button, so an admin can
   * check a pasted link resolved to the right ground. Null when nothing is set.
   */
  mapHref?: string | null;
}) {
  const isEdit = venue !== undefined;
  const [state, formAction] = useActionState(
    isEdit ? updateVenueAction : createVenueAction,
    INITIAL,
  );
  const key = venue?.id ?? "new";

  return (
    <form action={formAction} data-testid={isEdit ? "venue-edit-form" : "venue-create-form"}>
      {isEdit && <input type="hidden" name="venueId" value={venue.id} />}

      <div className={`grid gap-4 ${isEdit ? "" : "md:grid-cols-2 md:gap-x-6"}`}>
        <div className="min-w-0">
          <label className="field-label" htmlFor={`name-${key}`}>
            {strings.admin.venueNameLabel}
          </label>
          <input
            id={`name-${key}`}
            name="name"
            required
            maxLength={80}
            defaultValue={venue?.name ?? ""}
            data-testid="venue-name-input"
            className="field mt-1 w-full"
          />
        </div>

        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <label className="field-label" htmlFor={`map-${key}`}>
              {strings.admin.venueMapQueryLabel}
            </label>
            {mapHref && (
              <a
                href={mapHref}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="venue-map-link"
                className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-volt no-underline hover:underline"
              >
                <Icon name="pin" className="h-[14px] w-[14px]" />
                {strings.admin.pitch.openMap}
              </a>
            )}
          </div>
          <input
            id={`map-${key}`}
            name="mapQuery"
            defaultValue={venue?.map_query ?? ""}
            data-testid="venue-map-input"
            className="field mt-1 w-full"
          />
          <p className="mb-0 mt-1 text-[12px] leading-snug text-muted">
            {strings.admin.venueMapQueryHint}
          </p>
        </div>

        {/*
          THE ADDRESS (round 42) — the line under the venue's name on a game's
          story image, as people say it. The map field above may hold
          coordinates, which is right for a map and wrong for a caption.
        */}
        {canSetAddress && (
          <div className="min-w-0">
            <label className="field-label" htmlFor={`address-${key}`}>
              {strings.admin.venueAddressLabel}
            </label>
            <input
              id={`address-${key}`}
              name="address"
              maxLength={120}
              placeholder="Dubečská 9, Praha 10"
              defaultValue={venue?.address ?? ""}
              data-testid="venue-address-input"
              className="field mt-1 w-full"
            />
            <p className="mb-0 mt-1 text-[12px] leading-snug text-muted">
              {strings.admin.venueAddressHint}
            </p>
          </div>
        )}

        {/*
          THE PITCH NAME IS EDIT-ONLY. On a create form it is a field for a fact
          nobody has yet — the venue is being made because a game needs it, and
          which pitch is a later thought.
        */}
        {isEdit && (
          <div className="min-w-0">
            <label className="field-label" htmlFor={`pitch-${venue.id}`}>
              {strings.admin.pitchNameLabel}
            </label>
            <input
              id={`pitch-${venue.id}`}
              name="pitchName"
              defaultValue={venue.pitch_name ?? ""}
              data-testid="venue-pitch-input"
              className="field mt-1 w-full"
            />
            <p className="mb-0 mt-1 text-[12px] leading-snug text-muted">
              {strings.admin.venuePitchNameHint}
            </p>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <PendingButton
          label={isEdit ? strings.admin.venueSave : strings.admin.venueCreate}
          testId={isEdit ? "venue-save" : "venue-create"}
        />
        {(state.status === "saved" || state.status === "created") && (
          <p data-testid="venue-saved" role="status" className="m-0 text-small text-volt">
            {state.status === "created" ? strings.admin.venueCreated : strings.admin.venueSaved}
          </p>
        )}
      </div>

      {/*
        THE PHOTO STEP, IN PLACE, THE MOMENT THE VENUE EXISTS (round 30,
        item 1).

        `set_venue_photo` takes a venue id, so before this the pitch photo was
        an EDIT-only control and "create a venue, crop the photo" meant
        creating it, finding it in the list below, and opening it again. The id
        comes back with the success, so the crop happens where the creating
        happened.

        RENDERED OUTSIDE THE `<form>`'s fields but inside its element is not an
        option — a file input inside a form that has just submitted would be
        re-submitted by the next Enter. `PhotoUpload` posts nothing; it uploads
        directly and refreshes.
      */}
      {state.status === "created" && state.venueId && (
        <div data-testid="venue-create-photo" className="mt-5 border-t border-hairline pt-4">
          <VenuePhotoUpload venueId={state.venueId} hasPhoto={false} emptyFrame={false} />
        </div>
      )}
      {state.status === "error" && state.message && (
        <p role="alert" data-testid="venue-error" className="mb-0 mt-3 text-small text-bone">
          {state.message}
        </p>
      )}
    </form>
  );
}
