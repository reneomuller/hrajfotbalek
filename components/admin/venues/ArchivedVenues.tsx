import { deleteVenueAction, restoreVenueAction } from "@/app/admin/venues/actions";
import { DeleteControl } from "@/components/admin/DeleteControl";
import { VenueArchiveButton } from "@/components/admin/VenueArchiveButton";
import { Chevron } from "@/components/admin/venues/Chevron";
import { PitchCostReadout } from "@/components/admin/venues/PitchCostReadout";
import type { PitchCostPair } from "@/lib/admin/venues/pitchCosts";
import type { PitchSeason } from "@/lib/types/database";
import { strings } from "@/lib/strings";

interface ArchivedVenue {
  id: string;
  name: string;
  pitch_name: string | null;
}

/**
 * Archived venues, below the list and collapsed (round 39, item 2; restyled in
 * round 42). Archive replaced delete for any venue with games: it leaves the
 * picker, never a game. Restore is the undo, and a venue nobody has played at
 * can still be deleted outright.
 *
 * ONE CARD, ONE ROW PER VENUE, read-only apart from those two — including the
 * pitch costs, which no new game can be created against while it is archived.
 */
export function ArchivedVenues({
  venues,
  canDelete,
  pitch,
}: {
  venues: ArchivedVenue[];
  canDelete: (venueId: string) => boolean;
  pitch: { season: PitchSeason; costs: Map<string, PitchCostPair> } | null;
}) {
  if (venues.length === 0) return null;

  return (
    <details className="lifted group mt-8 rounded-card" data-testid="venues-archived">
      <summary
        data-testid="venues-archived-summary"
        className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-card px-4 py-3 transition-colors marker:content-none hover:bg-surface active:bg-surface group-open:rounded-b-none sm:px-5 [&::-webkit-details-marker]:hidden"
      >
        <h3 className="m-0 text-[10px] font-normal uppercase tracking-eyebrow text-muted">
          {strings.admin.venuesArchivedHeading.replace("{count}", String(venues.length))}
        </h3>
        <Chevron />
      </summary>

      <div className="border-t border-hairline px-4 pb-2 pt-4 sm:px-5">
        <p className="m-0 max-w-[560px] text-[12px] leading-relaxed text-muted">
          {strings.admin.venuesArchivedLede}
        </p>
        <ul className="mt-3 list-none p-0">
          {venues.map((venue) => {
            const costs = pitch?.costs.get(venue.id);
            return (
              <li
                key={venue.id}
                data-testid="venue-archived-row"
                data-venue-id={venue.id}
                className="flex flex-col gap-3 border-t border-hairline py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <span className="block truncate text-body font-semibold text-bone">{venue.name}</span>
                  <span className="mt-[1px] block truncate text-[12px] text-muted">
                    {venue.pitch_name ?? strings.admin.venueNoPitchName}
                  </span>
                  {pitch && costs && (
                    <div className="mt-2">
                      <PitchCostReadout costs={costs} season={pitch.season} />
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-start gap-3">
                  <VenueArchiveButton
                    action={restoreVenueAction}
                    venueId={venue.id}
                    label={strings.admin.restoreVenue}
                    testId="venue-restore"
                  />
                  {canDelete(venue.id) && (
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
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
