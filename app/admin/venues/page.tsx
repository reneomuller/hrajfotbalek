import type { Metadata } from "next";
import { VenueAmenities } from "@/components/admin/VenueAmenities";
import { DeleteControl } from "@/components/admin/DeleteControl";
import { VenueForm } from "@/components/admin/VenueForm";
import {
  archiveVenueAction,
  deleteVenueAction,
  restoreVenueAction,
} from "@/app/admin/venues/actions";
import { VenueArchiveButton } from "@/components/admin/VenueArchiveButton";
import { partitionVenues } from "@/lib/venues/archive";
import { appCapabilities } from "@/lib/db/capabilities";
import { VenuePhotoUpload } from "@/components/admin/VenuePhotoUpload";
import { venuePhotoUrl } from "@/lib/storage/avatar";
import { venuePhotoVersion } from "@/lib/storage/venuePhotoVersions";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { countGamesByVenue, listVenues } from "@/lib/admin/queries";
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
 *
 * ARCHIVED VENUES SIT BELOW, COLLAPSED (round 39, item 2). Archive replaced
 * delete for any venue with games: it leaves the picker, never a game. A
 * venue nobody has played at can still be deleted outright.
 */
export default async function AdminVenuesPage() {
  await requireAdmin();
  const [all, capabilities, gameCounts] = await Promise.all([
    listVenues(),
    appCapabilities(),
    countGamesByVenue(),
  ]);
  const { active: venues, archived } = partitionVenues(all);
  // Each photo as players see it — versioned, so a replacement shows at once.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const photoUrls = new Map(
    await Promise.all(
      venues.map(
        async (venue) =>
          [
            venue.id,
            venuePhotoUrl(supabaseUrl, venue.image_path, await venuePhotoVersion(venue.image_path)),
          ] as const,
      ),
    ),
  );
  /*
   * DELETE ONLY WHERE IT CAN SUCCEED once archive exists. Before the migration
   * the old control stays exactly as it was — offered everywhere, refused in
   * SQL for a venue with games — because there is nothing else to offer.
   */
  const canHardDelete = (venueId: string) =>
    capabilities.adminDelete &&
    (!capabilities.venueArchive ||
      (gameCounts.ok && (gameCounts.counts.get(venueId) ?? 0) === 0));

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

                  {/*
                    A DISCLOSURE MARKER, AND ITS ABSENCE WAS A REAL BUG
                    (round 17, item 1).

                    `marker:content-none` strips the browser's default triangle
                    — correct, because the default is a tiny grey wedge that
                    belongs to no design — and round 13 put nothing back. So a
                    venue row read as a static list item: name, pitch, photo
                    state, and no signal at all that it opens.

                    EVERY CONTROL ON THIS PAGE IS INSIDE ONE OF THESE. Rename,
                    map link, pitch name, photo, amenities and (round 16)
                    delete are all behind a row nobody could tell was a door.
                    The owner reported the delete as missing; it was rendering
                    the whole time, at y≈1756 of an expanded panel, behind a
                    summary that did not invite a tap.

                    `group-open:rotate-180` on the parent `<details className="group">`
                    — a chevron that turns is the one disclosure idiom that
                    needs no label, in any of three languages.
                  */}
                  <span
                    aria-hidden
                    data-testid="venue-disclosure"
                    className="shrink-0 text-[12px] text-muted transition-transform group-open:rotate-180"
                  >
                    ▾
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
                  <VenuePhotoUpload
                    venueId={venue.id}
                    hasPhoto={venue.image_path !== null}
                    photoUrl={photoUrls.get(venue.id) ?? null}
                  />
                </div>

                <div className="mt-6">
                  <VenueAmenities venueId={venue.id} current={venue.amenities} />
                </div>
              </div>

              {/*
                ARCHIVE, THEN DELETE, LAST AND QUIETEST (round 16 item 18,
                round 39 item 2).

                Below the presets rather than beside the name: putting a
                destructive control next to Save is how somebody removes a
                venue they meant to rename.

                ARCHIVE is what retiring a ground means — it leaves the picker
                and every game at it keeps it. DELETE survives only for a venue
                no game references, which is the only one `admin_delete_venue`
                accepts; the refusal in SQL is still the safety.
              */}
              {(capabilities.venueArchive || canHardDelete(venue.id)) && (
                <div className="mt-8 flex flex-wrap items-start gap-3 border-t border-hairline pt-4">
                  {capabilities.venueArchive && (
                    <div>
                      <VenueArchiveButton
                        action={archiveVenueAction}
                        venueId={venue.id}
                        label={strings.admin.archiveVenue}
                        testId="venue-archive"
                      />
                      <p className="mt-2 max-w-[360px] text-[12px] text-muted">
                        {strings.admin.archiveVenueHint}
                      </p>
                    </div>
                  )}
                  {canHardDelete(venue.id) && (
                    <DeleteControl
                      action={deleteVenueAction}
                      hiddenFields={{ venueId: venue.id }}
                      label={strings.admin.deleteVenue}
                      title={strings.admin.deleteVenueConfirmTitle}
                      body={strings.admin.deleteVenueConfirmBody}
                      confirmLabel={strings.admin.deleteVenueConfirm}
                      testId="venue-delete"
                    />
                  )}
                </div>
              )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <details className="group mt-10 border-t border-hairline pt-6" data-testid="venues-archived">
          <summary
            data-testid="venues-archived-summary"
            className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 marker:content-none"
          >
            <h3 className="m-0 font-display text-body-lg uppercase tracking-wide text-muted">
              {strings.admin.venuesArchivedHeading.replace("{count}", String(archived.length))}
            </h3>
            <ChevronDown />
          </summary>
          <p className="mt-2 max-w-[560px] text-[12px] leading-relaxed text-muted">
            {strings.admin.venuesArchivedLede}
          </p>
          <ul className="mt-4 list-none space-y-2 p-0">
            {archived.map((venue) => (
              <li
                key={venue.id}
                data-testid="venue-archived-row"
                data-venue-id={venue.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-hairline px-5 py-3"
              >
                <span className="min-w-0">
                  <span className="block truncate text-body font-semibold text-bone">
                    {venue.name}
                  </span>
                  <span className="mt-[1px] block truncate text-[12px] text-muted">
                    {venue.pitch_name ?? strings.admin.venueNoPitchName}
                  </span>
                </span>
                <span className="flex flex-wrap items-start gap-3">
                  <VenueArchiveButton
                    action={restoreVenueAction}
                    venueId={venue.id}
                    label={strings.admin.restoreVenue}
                    testId="venue-restore"
                  />
                  {canHardDelete(venue.id) && (
                    <DeleteControl
                      action={deleteVenueAction}
                      hiddenFields={{ venueId: venue.id }}
                      label={strings.admin.deleteVenue}
                      title={strings.admin.deleteVenueConfirmTitle}
                      body={strings.admin.deleteVenueConfirmBody}
                      confirmLabel={strings.admin.deleteVenueConfirm}
                      testId="venue-delete"
                    />
                  )}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

/**
 * The disclosure cue, DRAWN rather than typed — CLAUDE.md's glyph rule: `▾`
 * renders as a dot in several fallback faces on this type stack.
 */
function ChevronDown() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 8"
      className="h-2 w-3 shrink-0 text-muted transition-transform group-open:rotate-180"
    >
      <path d="M1 1.5 6 6.5 11 1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
