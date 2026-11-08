import Image from "next/image";
import {
  archiveVenueAction,
  deleteVenueAction,
} from "@/app/admin/venues/actions";
import { DeleteControl } from "@/components/admin/DeleteControl";
import { VenueAmenities } from "@/components/admin/VenueAmenities";
import { VenueArchiveButton } from "@/components/admin/VenueArchiveButton";
import { VenueForm } from "@/components/admin/VenueForm";
import { VenuePhotoUpload } from "@/components/admin/VenuePhotoUpload";
import { Chevron } from "@/components/admin/venues/Chevron";
import { VenuePitchCostForm } from "@/components/admin/venues/VenuePitchCostForm";
import { pitchCostInForce, type PitchCostPair } from "@/lib/admin/venues/pitchCosts";
import { formatCzk } from "@/lib/format";
import type { Database, PitchSeason } from "@/lib/types/database";
import { venueMapsHref } from "@/lib/venues/mapsHref";
import { strings } from "@/lib/strings";

type VenueRow = Database["public"]["Tables"]["venues"]["Row"];

/**
 * One venue on `/admin/venues` (round 42, the admin rebuild): a lifted card
 * whose closed row carries what you scan the list for — the photo, the name,
 * the pitch and address, and what a game created there now costs — and whose
 * open body is every control the venue has, grouped.
 *
 * `<details>` RATHER THAN STATE, as it has been since round 13: server-
 * rendered, no JavaScript, keyboard and screen-reader behaviour for free, and
 * the browser keeps a row open while you work in it — through the re-render
 * every save triggers, because nothing here sets `open`.
 *
 * OPEN, IT IS TWO COLUMNS FROM `md`: the venue's own facts and its pitch cost
 * on the left, what every game here inherits (the photo, the amenities) on the
 * right, and retiring it — archive, then delete — last and quietest, below
 * both. At phone width the same groups stack in that order.
 */
export function VenueCard({
  venue,
  photoUrl,
  canSetAddress,
  canArchive,
  canDelete,
  pitch,
}: {
  venue: VenueRow;
  photoUrl: string | null;
  canSetAddress: boolean;
  canArchive: boolean;
  canDelete: boolean;
  /** Null until `app_capabilities()` says `pitchCosts`; then the season and this venue's two prices. */
  pitch: { season: PitchSeason; costs: PitchCostPair | null } | null;
}) {
  const costNow = pitch?.costs ? pitchCostInForce(pitch.costs, pitch.season) : null;
  const mapHref =
    venue.map_query || venue.map_url
      ? venueMapsHref({ name: venue.name, mapQuery: venue.map_query, mapUrl: venue.map_url })
      : null;
  const subline = [venue.pitch_name ?? strings.admin.venueNoPitchName, venue.address]
    .filter(Boolean)
    .join(" · ");

  return (
    <li data-testid="venue-row" data-venue-id={venue.id} className="lifted rounded-card">
      <details className="group">
        <summary
          data-testid="venue-summary"
          className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-card px-4 py-3 transition-colors marker:content-none hover:bg-surface active:bg-surface group-open:rounded-b-none sm:px-5 [&::-webkit-details-marker]:hidden"
        >
          <VenueThumb url={photoUrl} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body font-semibold text-white">{venue.name}</span>
            <span className="mt-[1px] block truncate text-[12px] text-muted">{subline}</span>
          </span>
          {costNow !== null && (
            <span
              data-testid="venue-cost-now"
              data-amount={costNow}
              className="shrink-0 text-small font-semibold tabular-nums text-bone"
            >
              {formatCzk(costNow)}
            </span>
          )}
          <Chevron testId="venue-disclosure" />
        </summary>

        <div className="border-t border-hairline px-4 pb-5 pt-5 sm:px-5">
          <div className="grid gap-8 md:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-8">
              <section aria-labelledby={`venue-details-${venue.id}`}>
                <SubHeading id={`venue-details-${venue.id}`}>
                  {strings.admin.pitch.detailsHeading}
                </SubHeading>
                <VenueForm venue={venue} canSetAddress={canSetAddress} mapHref={mapHref} />
              </section>

              {pitch && (
                <section
                  aria-labelledby={`venue-pitch-cost-${venue.id}`}
                  data-testid="venue-pitch-cost"
                >
                  <SubHeading id={`venue-pitch-cost-${venue.id}`}>
                    {strings.admin.pitch.costHeading}
                  </SubHeading>
                  <VenuePitchCostForm venueId={venue.id} costs={pitch.costs} season={pitch.season} />
                </section>
              )}
            </div>

            {/*
              THE PRESETS, LABELLED AS INHERITED. Both write immediately
              through their own RPCs rather than riding the details form's
              submit — `set_venue_photo` needs an upload to have happened and
              `set_venue_amenities` replaces a whole set. One button with three
              failure modes behind it is what that would have been.
            */}
            <section aria-labelledby={`venue-presets-${venue.id}`} className="min-w-0">
              <SubHeading id={`venue-presets-${venue.id}`}>
                {strings.admin.venuePresetsHeading}
              </SubHeading>
              <div className="flex flex-col gap-8">
                <VenuePhotoUpload
                  venueId={venue.id}
                  hasPhoto={venue.image_path !== null}
                  photoUrl={photoUrl}
                />
                <VenueAmenities venueId={venue.id} current={venue.amenities} />
              </div>
            </section>
          </div>

          {/*
            ARCHIVE, THEN DELETE, LAST AND QUIETEST (round 16 item 18, round 39
            item 2). Below everything rather than beside the name: a
            destructive control next to Save is how somebody removes a venue
            they meant to rename. ARCHIVE is what retiring a ground means — it
            leaves the picker and every game at it keeps it. DELETE survives
            only for a venue no game references; the refusal in SQL is still
            the safety.
          */}
          {(canArchive || canDelete) && (
            <div className="mt-8 flex flex-col gap-3 border-t border-hairline pt-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              {canArchive && (
                <p className="m-0 max-w-[420px] text-[12px] leading-relaxed text-muted">
                  {strings.admin.archiveVenueHint}
                </p>
              )}
              <div className="flex flex-wrap items-start gap-3 sm:ml-auto">
                {canArchive && (
                  <VenueArchiveButton
                    action={archiveVenueAction}
                    venueId={venue.id}
                    label={strings.admin.archiveVenue}
                    testId="venue-archive"
                  />
                )}
                {canDelete && (
                  <div>
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
            </div>
          )}
        </div>
      </details>
    </li>
  );
}

/** A group's eyebrow inside an open venue — the label every admin panel uses. */
function SubHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h4 id={id} className="m-0 mb-4 text-[10px] font-normal uppercase tracking-eyebrow text-volt-dim">
      {children}
    </h4>
  );
}

/**
 * The venue's photo on its closed row, or an empty tile saying there is none —
 * the "Photo set / No photo" the row used to spell out, shown instead. Square
 * and small: it is a way to find a ground in the list, not a preview of the
 * crop, which the open row draws at the card's own frame.
 */
function VenueThumb({ url }: { url: string | null }) {
  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={44}
        height={44}
        sizes="44px"
        data-testid="venue-thumb"
        className="h-11 w-11 shrink-0 rounded-control border border-hairline object-cover"
      />
    );
  }
  return (
    <span
      data-testid="venue-thumb-empty"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-dashed border-hairline-strong bg-surface text-center text-[10px] leading-tight text-faint"
    >
      {strings.admin.venueNoPhoto}
    </span>
  );
}
