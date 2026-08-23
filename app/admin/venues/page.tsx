import type { Metadata } from "next";
import { VenueAmenities } from "@/components/admin/VenueAmenities";
import { DeleteControl } from "@/components/admin/DeleteControl";
import { VenueForm } from "@/components/admin/VenueForm";
import { deleteVenueAction } from "@/app/admin/venues/actions";
import { appCapabilities } from "@/lib/db/capabilities";
import { VenuePhotoUpload } from "@/components/admin/VenuePhotoUpload";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { listVenues } from "@/lib/admin/queries";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.admin.venuesTitle };
export const dynamic = "force-dynamic";

/**
 * `/admin/venues` — the surface item 24 asks for.
 *
 * WHERE THIS LIVED BEFORE, AND WHY THAT WAS WRONG. A venue could be CREATED as
 * a side effect of making a game — pick "new" in the game form's venue
 * dropdown — and its photo and amenities could be edited from the detail page
 * of some game that happened to be played there. Its name, map link and pitch
 * name could not be changed at all.
 *
 * So the only route to a venue was through a game, which is backwards: a venue
 * outlives every game played on it, and the facts recorded here — the
 * photograph, what is provided, where the map points — are inherited by all of
 * them.
 *
 * ONE PAGE, EVERY VENUE, ONE OPEN AT A TIME. Not a list that links to a detail
 * page per venue: a link is a page load between the organizer and the thing
 * they came to change, and the browser's back button then loses their place.
 *
 * ~~EXPANDED, because there are a handful of grounds.~~ THERE ARE ELEVEN, and
 * each carries a form, a photo control and a ten-box amenity grid. Rendered
 * open that is roughly 3,000px per venue and a THIRTY-TWO-THOUSAND-PIXEL page
 * — measured, an hour after this page first shipped, by screenshotting it.
 *
 * `<details>` RATHER THAN STATE. Server-rendered, no JavaScript, keyboard and
 * screen-reader behaviour for free, and the browser keeps one open while you
 * work in it. The summary carries the two facts you scan a venue list for:
 * its name, and whether it has a photograph yet.
 */
export default async function AdminVenuesPage() {
  await requireAdmin();
  const [venues, capabilities] = await Promise.all([listVenues(), appCapabilities()]);

  return (
    <>
      <h2 className="m-0 font-display text-page-title uppercase tracking-wide text-white">
        {strings.admin.venuesTitle}
      </h2>
      <p className="mt-2 max-w-[560px] text-[13px] leading-relaxed text-muted">
        {strings.admin.venuesLede}
      </p>

      <section className="lifted mt-6 rounded-card p-5" data-testid="venue-create-section">
        <h3 className="m-0 font-display text-body-lg uppercase tracking-wide text-white">
          {strings.admin.venueNewHeading}
        </h3>
        <div className="mt-4">
          <VenueForm />
        </div>
      </section>

      {venues.length === 0 ? (
        <p className="mt-8 text-[12px] tracking-[1px] text-faint">
          {strings.admin.venuesEmpty}
        </p>
      ) : (
        <ul className="mt-8 list-none space-y-4 p-0">
          {venues.map((venue) => (
            <li
              key={venue.id}
              data-testid="venue-row"
              data-venue-id={venue.id}
              className="lifted rounded-card"
            >
              <details className="group">
                <summary
                  data-testid="venue-summary"
                  className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 marker:content-none"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-body font-semibold text-white">
                      {venue.name}
                    </span>
                    <span className="mt-[1px] block truncate text-[12px] text-muted">
                      {venue.pitch_name ?? strings.admin.venueNoPitchName}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-[12px] font-semibold ${
                      venue.image_path ? "text-volt-dim" : "text-faint"
                    }`}
                  >
                    {venue.image_path
                      ? strings.admin.venueHasPhoto
                      : strings.admin.venueNoPhoto}
                  </span>
                </summary>

                <div className="border-t border-hairline px-5 pb-5 pt-5">
              <VenueForm venue={venue} />

              {/*
                THE PRESETS, BENEATH THE FIELDS AND LABELLED AS INHERITED.

                Both write immediately through their own RPCs rather than
                riding this form's submit — `set_venue_photo` needs an upload
                to have happened and `set_venue_amenities` replaces a whole
                set. Putting them inside the form would mean one button with
                three different failure modes behind it.
              */}
              <div className="mt-6 border-t border-hairline pt-5">
                <h4 className="m-0 text-[10px] uppercase tracking-eyebrow text-volt-dim">
                  {strings.admin.venuePresetsHeading}
                </h4>

                <div className="mt-4">
                  <VenuePhotoUpload venueId={venue.id} hasPhoto={venue.image_path !== null} />
                </div>

                <div className="mt-6">
                  <VenueAmenities venueId={venue.id} current={venue.amenities} />
                </div>
              </div>

              {/*
                DELETE, LAST AND QUIETEST (round 16, item 18).

                Below the presets rather than beside the name: it is the one
                control here that cannot be undone by pressing something else,
                and putting it next to Save is how somebody deletes a venue
                they meant to rename.

                THE REFUSAL IS THE SAFETY, not the placement. `admin_delete_venue`
                counts the games referencing this row and raises rather than
                orphaning them; the dialog explains, and the error names the
                next step. Gated on the round-16 migration.
              */}
              {capabilities.adminDelete && (
                <div className="mt-8 border-t border-hairline pt-4">
                  <DeleteControl
                    action={deleteVenueAction}
                    hiddenFields={{ venueId: venue.id }}
                    label={strings.admin.deleteVenue}
                    title={strings.admin.deleteVenueConfirmTitle}
                    body={strings.admin.deleteVenueConfirmBody}
                    confirmLabel={strings.admin.deleteVenueConfirm}
                    testId="venue-delete"
                  />
                </div>
              )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
