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

/**
 * Which pitch name applies to a game (migration 41).
 *
 * ONE PLACE, because the precedence is a rule and not a `??` to be retyped at
 * each render site. The game's own name wins; the venue's is the ground's
 * default; neither renders the venue name alone.
 *
 * `listPitchNamesByGame` implements the same rule in bulk for list surfaces —
 * it cannot call this, because it resolves the venue in one query for a whole
 * page rather than per game. The two must agree, which is why they say so in
 * each other's comments.
 */
export function effectivePitchName(
  gamePitchName: string | null | undefined,
  venuePitchName: string | null | undefined,
): string | null {
  const own = gamePitchName?.trim();
  if (own) return own;
  const fallback = venuePitchName?.trim();
  return fallback ? fallback : null;
}
