import { strings } from "@/lib/strings";

/**
 * Maps a Postgres error message onto admin-facing copy.
 *
 * The RPCs raise bare codes (`CAPACITY_BELOW_ACTIVE_BOOKINGS`,
 * `INVALID_TRANSITION`, …) and PostgREST surfaces them with framing text
 * around them, so this matches on containment rather than equality — the same
 * approach `lib/booking/errors.ts` takes for the player-facing codes.
 *
 * Anything unrecognised falls back to the generic message rather than being
 * echoed: a raw driver error in an admin panel is both unhelpful and a small
 * disclosure of the schema.
 */
const CODES: Array<[string, string]> = [
  ["CAPACITY_BELOW_ACTIVE_BOOKINGS", strings.admin.capacityBelowBooked],
  ["INVALID_CAPACITY", strings.admin.capacityInvalid],
  ["INVALID_PRICE", strings.admin.priceInvalid],
  ["INVALID_STARTS_AT", strings.admin.startsAtRequired],
  ["INVALID_TRANSITION", strings.admin.invalidTransition],
  ["VENUE_EXISTS", strings.admin.venueExists],
  ["VENUE_NOT_FOUND", strings.admin.venueRequired],
  ["GAME_NOT_FOUND", strings.games.notFound],
  ["INSUFFICIENT_PERMISSION", strings.errors.insufficientPermission],
  // CHECK-constraint violations reach here as the constraint name.
  ["venues_image_path_format", strings.admin.venueImageInvalid],
  ["games_format_format", strings.admin.formatInvalid],
  ["games_notes_length", strings.admin.notesTooLong],
];

export function toAdminErrorMessage(raw: string | null | undefined): string {
  if (!raw) return strings.errors.generic;
  for (const [code, message] of CODES) {
    if (raw.includes(code)) return message;
  }
  return strings.errors.generic;
}
