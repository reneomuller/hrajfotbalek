import { parseCoordinatePair } from "@/lib/venues/mapsLink";

/**
 * Where the player's map button actually goes, and what the page calls the
 * place (round 31, item 1).
 *
 * THE OBSERVATION THAT STARTED THIS: round 30 taught the venue field to store
 * coordinates, which put the pin in exactly the right spot — and then the
 * directions button opened Google labelled `50.092534,14.475315`. The pin was
 * right and the product looked broken, because a player does not read a
 * coordinate pair as a place. Correct and cheap-looking is still a defect.
 *
 * SO THE VENUE KEEPS BOTH THE SOURCE AND THE COORDINATES, and this module is
 * the one place that decides which to use for which job. Three cases, and they
 * are genuinely different rather than three spellings of one:
 *
 *   (a) A SHARE LINK WAS PASTED. The original URL is kept in `map_url`, and
 *       the button opens THAT — Google's own place card, with the name, the
 *       photographs and the entrance. Nothing we could assemble beats the page
 *       Google already has for that exact place. The coordinates extracted
 *       from it still serve everything internal.
 *
 *   (b) COORDINATES ONLY. There is no place card to open, so one is asked for:
 *       a Maps SEARCH combining the venue's display name with the coordinates.
 *       Google resolves the named place at that spot and labels it properly,
 *       and when it finds no match the coordinates still put the pin exactly
 *       where it belongs. The name is a hint, never a replacement for the pin.
 *
 *   (c) AN ADDRESS OR A NAME WAS TYPED. Unchanged — it was never broken, and
 *       a search for "Nad Ohradou 2825/23" opens exactly what it should.
 *
 * THE RULE UNDERNEATH ALL THREE: a player is never shown a bare `lat,lng`
 * where a name is available. That applies to the LABEL Google shows and to the
 * address line this product prints itself — see `venueAddressLine`, which had
 * been printing raw coordinates and raw URLs straight onto the page.
 */

export interface VenueLocation {
  /** The venue's display name — always present, and the fallback for everything. */
  name: string;
  /** Coordinates, an address, a place name, or null. Never a URL after round 31. */
  mapQuery: string | null;
  /** The share link the admin pasted, when they pasted one. */
  mapUrl: string | null;
}

/**
 * ONE HOST, BUILT ONE WAY. `/maps/search/?api=1&query=` is Google's documented
 * entry point and behaves the same on the web and in both mobile apps —
 * unlike `maps.google.com/?q=`, which is a legacy redirect and which is what
 * this product used to build.
 */
function searchHref(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Where the player's "Open map" / directions button points. */
export function venueMapsHref(venue: VenueLocation): string {
  const url = venue.mapUrl?.trim();
  // (a) The admin's own share link wins outright.
  if (url) return url;

  const query = venue.mapQuery?.trim() ?? "";
  const coords = query ? parseCoordinatePair(query) : null;

  /*
   * (b) NAME FIRST, COORDINATES SECOND, IN ONE QUERY STRING. Google treats
   * this as "find something called X near here": a hit is labelled with the
   * real place, and a miss still drops the pin on the numbers. Putting the
   * coordinates first inverts that — the pin wins and the name is ignored —
   * which is the behaviour this item exists to get rid of.
   */
  if (coords) return searchHref(`${venue.name} ${query}`);

  // (c) Whatever the admin typed, or the venue's own name when they typed
  // nothing. Exactly what shipped before, deliberately untouched.
  return searchHref(query || venue.name);
}

/**
 * The address line the product prints under the venue's name.
 *
 * IT HAD BEEN PRINTING WHATEVER WAS IN `map_query`, which after round 30 meant
 * a coordinate pair, and before round 30 meant — for two venues on production —
 * a raw `https://maps.app.goo.gl/…` URL. Both were shown to players as though
 * they were addresses.
 *
 * NULL MEANS "PRINT NOTHING", and nothing is the right answer more often than
 * it looks: a venue whose only location data is a pin has no address to state,
 * and inventing one from coordinates would be the same defect in a new place.
 */
export function venueAddressLine(venue: Pick<VenueLocation, "name" | "mapQuery">): string | null {
  const query = venue.mapQuery?.trim();
  if (!query) return null;

  // A URL is not an address. Legacy rows still hold one until the backfill.
  if (/^https?:\/\//i.test(query)) return null;

  // Coordinates are not an address either — the pin is on the button.
  if (parseCoordinatePair(query)) return null;

  // A query identical to the name would print the same words twice.
  if (query === venue.name.trim()) return null;

  return query;
}
