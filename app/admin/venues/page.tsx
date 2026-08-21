import type { Metadata } from "next";
import { VenueAmenities } from "@/components/admin/VenueAmenities";
import { VenueForm } from "@/components/admin/VenueForm";
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
 * ONE PAGE, EVERY VENUE, EXPANDED. Not a list that links to a detail page per
 * venue: there are a handful of grounds, each has four fields, and a list of
 * links would be a click between the organizer and the thing they came to
 * change.
 */
export default async function AdminVenuesPage() {
  await requireAdmin();
  const venues = await listVenues();

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
              className="lifted rounded-card p-5"
            >
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
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
