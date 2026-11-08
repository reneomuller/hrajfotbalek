import type { Metadata } from "next";
import { Panel } from "@/components/admin/ui/Panel";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { VenueForm } from "@/components/admin/VenueForm";
import { ArchivedVenues } from "@/components/admin/venues/ArchivedVenues";
import { PitchSeasonSwitch } from "@/components/admin/venues/PitchSeasonSwitch";
import { VenueCard } from "@/components/admin/venues/VenueCard";
import { partitionVenues } from "@/lib/venues/archive";
import { appCapabilities } from "@/lib/db/capabilities";
import { venuePhotoUrl } from "@/lib/storage/avatar";
import { venuePhotoVersion } from "@/lib/storage/photoVersions";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { countGamesByVenue, listVenues } from "@/lib/admin/queries";
import { getPitchSeason, getVenuePitchCosts } from "@/lib/admin/economics";
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
 * — measured, an hour after this page first shipped, by screenshotting it. So
 * each venue is a `<details>` card (`VenueCard`), closed by default.
 *
 * THE ORDER (round 42, the admin rebuild): the page header, the one season
 * switch that prices every venue's new games, adding a venue, then the
 * venues — each closed row showing its photo and what a game created there now
 * costs — and the archive, collapsed, last.
 *
 * PITCH COSTS WAIT FOR THE DATABASE. Before `20261108100000` none of the pitch
 * tables exist, so the switch, the cost on each row and the cost area inside
 * it render only once `app_capabilities()` says `pitchCosts` — the
 * `venueAddress` / `venueArchive` pattern.
 */
export default async function AdminVenuesPage() {
  await requireAdmin();
  const capabilities = await appCapabilities();
  const [all, gameCounts, pitch] = await Promise.all([
    listVenues(),
    countGamesByVenue(),
    capabilities.pitchCosts
      ? Promise.all([getPitchSeason(), getVenuePitchCosts()]).then(([season, costs]) => ({
          season,
          costs,
        }))
      : Promise.resolve(null),
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
      <PageHeader title={strings.admin.venuesTitle} lede={strings.admin.venuesLede} />

      {pitch && <PitchSeasonSwitch current={pitch.season} className="mt-6" />}

      <Panel
        title={strings.admin.venueNewHeading}
        testId="venue-create-section"
        className={pitch ? "mt-4" : "mt-6"}
      >
        <VenueForm canSetAddress={capabilities.venueAddress} />
      </Panel>

      {venues.length === 0 ? (
        <p className="mt-8 text-small text-faint">{strings.admin.venuesEmpty}</p>
      ) : (
        <section aria-labelledby="venues-list-heading" className="mt-8">
          <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
            <h3
              id="venues-list-heading"
              className="m-0 text-[10px] font-normal uppercase tracking-eyebrow text-volt-dim"
            >
              {strings.admin.pitch.listHeading.replace("{count}", String(venues.length))}
            </h3>
            {pitch && (
              <span className="text-[10px] uppercase tracking-eyebrow text-muted">
                {strings.admin.pitch.listCostColumn.replace(
                  "{season}",
                  strings.admin.pitch.seasons[pitch.season],
                )}
              </span>
            )}
          </div>
          <ul className="m-0 list-none space-y-3 p-0">
            {venues.map((venue) => (
              <VenueCard
                key={venue.id}
                venue={venue}
                photoUrl={photoUrls.get(venue.id) ?? null}
                canSetAddress={capabilities.venueAddress}
                canArchive={capabilities.venueArchive}
                canDelete={canHardDelete(venue.id)}
                pitch={pitch && { season: pitch.season, costs: pitch.costs.get(venue.id) ?? null }}
              />
            ))}
          </ul>
        </section>
      )}

      <ArchivedVenues venues={archived} canDelete={canHardDelete} pitch={pitch} />
    </>
  );
}
