/**
 * Archived venues (round 39, item 2).
 *
 * AN ARCHIVED VENUE LEAVES THE PICKER, NEVER A GAME. `venues.archived_at` is
 * read here and nowhere on a player surface: every player read of a venue is
 * BY ID, through the game that references it, so a retired ground keeps its
 * name, photo and map link on every card and in every history.
 *
 * A MISSING COLUMN READS AS ACTIVE. The app deploys before the migration is
 * applied and reads venues with `select *`, which simply omits a column that
 * does not exist yet — so `undefined` must mean "not archived", or every venue
 * would vanish from the picker the moment this ships.
 */

interface ArchivableVenue {
  id: string;
  archived_at?: string | null;
}

export function isArchived(venue: ArchivableVenue): boolean {
  return venue.archived_at != null;
}

/**
 * The game form's venue choices: every active venue, plus the game's OWN venue
 * when it has been archived since. Dropping that one would open the edit form
 * unset, and an unset picker makes the game unsaveable — the null-`venue_id`
 * lesson in CLAUDE.md.
 */
export function pickableVenues<T extends ArchivableVenue>(
  venues: readonly T[],
  currentVenueId: string | null,
): T[] {
  return venues.filter((venue) => !isArchived(venue) || venue.id === currentVenueId);
}

/** The admin venue list, split into the open list and the collapsed archive. */
export function partitionVenues<T extends ArchivableVenue>(
  venues: readonly T[],
): { active: T[]; archived: T[] } {
  return {
    active: venues.filter((venue) => !isArchived(venue)),
    archived: venues.filter(isArchived),
  };
}
