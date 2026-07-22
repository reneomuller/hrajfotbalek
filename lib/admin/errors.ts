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

/**
 * Pulls the shortfall out of `PAYMENT_UNDERPAID`'s detail ("received X of Y").
 *
 * Read from the raise rather than recomputed in the action, so the number the
 * admin sees is the one `confirm_booking` actually compared — the amount due
 * is `price_czk - credit_applied_czk`, and re-deriving it from a page that may
 * be seconds stale is how the message ends up disagreeing with the refusal.
 *
 * Null for anything that is not an underpayment, so an unrelated failure is
 * never dressed up as a friendly shortfall.
 */
export function parseUnderpayment(raw: string | null | undefined): number | null {
  if (!raw || !raw.includes("PAYMENT_UNDERPAID")) return null;
  const match = raw.match(/received\s+(\d+)\s+of\s+(\d+)/);
  if (!match) return null;
  const received = Number(match[1]);
  const due = Number(match[2]);
  if (!Number.isFinite(received) || !Number.isFinite(due)) return null;
  return Math.max(0, due - received);
}

export function toAdminErrorMessage(raw: string | null | undefined): string {
  if (!raw) return strings.errors.generic;
  for (const [code, message] of CODES) {
    if (raw.includes(code)) return message;
  }
  return strings.errors.generic;
}
