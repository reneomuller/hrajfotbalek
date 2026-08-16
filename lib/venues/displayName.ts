/**
 * The venue line: "<pitch name> · <venue name>", or the venue name alone.
 *
 * THE PREFIX RULE (Section 3 item 4; Section 4 item 1 applies it to the detail
 * header). `venues.pitch_name` is nullable and most rows will never carry one —
 * a null renders today's two-part format, so no game is ever blocked on a
 * missing name.
 *
 * `venue` IS THE SNAPSHOT AND `pitchName` IS LIVE, deliberately. `games.venue`
 * is frozen at write time so a rename cannot rewrite the name on a game already
 * played (migration 20260722110000); the pitch name is read through
 * `games.venue_id` and is therefore current. For an upcoming game the two agree;
 * for a played one the snapshot is the record and the prefix is a label, which
 * is the correct precedence of the two.
 *
 * NOTHING IS PARSED. The middot is a JOIN between two stored fields, never a
 * split of one — `venues.name` is admin free text and one seeded row is an XSS
 * payload, so any parser would be guessing which fragment is which.
 */
export function venueDisplayName(
  venue: string,
  pitchName: string | null | undefined,
): string {
  const pitch = pitchName?.trim();
  return pitch ? `${pitch} \u00b7 ${venue}` : venue;
}
