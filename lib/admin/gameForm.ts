import { strings } from "@/lib/strings";
import type { GameSurface } from "@/lib/types/database";

/**
 * Game-form parsing and validation, as a pure function of the submitted
 * fields.
 *
 * NOTHING HERE IS ENFORCEMENT. Every rule below is also a CHECK constraint or
 * an RPC guard — the format regex, the surface set, the notes length, the
 * capacity floor. This exists so the organizer gets a labelled inline error
 * instead of a constraint violation, and so the parsing is testable without a
 * database. If the two ever disagree, the database is right.
 *
 * The one rule that lives ONLY in the database is the capacity floor
 * ("not below the active bookings"): it depends on rows this function cannot
 * see, and guessing at it here would be a race.
 */

export const SURFACES: GameSurface[] = ["turf", "grass", "indoor", "sand"];

/** Mirrors `games_format_format`. */
const FORMAT_RE = /^[0-9]{1,2}v[0-9]{1,2}$/;

/** Mirrors `venues_image_path_format`, minus the leading directory. */
const IMAGE_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(png|jpg|jpeg|webp|avif)$/i;

export const NOTES_MAX = 500;

export interface GameFormValues {
  venueId: string | null;
  newVenueName: string | null;
  newVenueImagePath: string | null;
  newVenueMapQuery: string | null;
  startsAt: string;
  capacity: number;
  priceCzk: number;
  format: string | null;
  surface: GameSurface | null;
  notes: string | null;
}

export type GameFormResult =
  | { ok: true; values: GameFormValues }
  | { ok: false; fieldErrors: Partial<Record<keyof GameFormValues | "venue", string>> };

function text(form: FormData, name: string): string {
  const raw = form.get(name);
  return typeof raw === "string" ? raw.trim() : "";
}

export function parseGameForm(form: FormData): GameFormResult {
  const fieldErrors: Partial<Record<keyof GameFormValues | "venue", string>> = {};

  // --- venue: pick one, or name a new one ------------------------------------
  const venueChoice = text(form, "venueId");
  const isNewVenue = venueChoice === "new";
  const newVenueName = isNewVenue ? text(form, "newVenueName") : "";
  const newVenueImage = isNewVenue ? text(form, "newVenueImage") : "";
  const newVenueMapQuery = isNewVenue ? text(form, "newVenueMapQuery") : "";

  if (isNewVenue && !newVenueName) {
    fieldErrors.venue = strings.admin.venueNameRequired;
  } else if (!isNewVenue && !venueChoice) {
    fieldErrors.venue = strings.admin.venueRequired;
  }

  // The form asks for a FILENAME and this builds the path, so an admin cannot
  // type a path at all — `/venues/` is not user input. The filename is still
  // validated, because it is the part that is.
  if (isNewVenue && newVenueImage && !IMAGE_FILE_RE.test(newVenueImage)) {
    fieldErrors.venue = strings.admin.venueImageInvalid;
  }

  // --- kick-off ---------------------------------------------------------------
  // `datetime-local` submits wall-clock text with no zone. Interpreting it is
  // the browser's job via the hidden ISO field the form fills in; if that is
  // missing the value is rejected rather than guessed at, because guessing the
  // zone silently moves a real game by an hour twice a year.
  const startsAtIso = text(form, "startsAtIso");
  if (!startsAtIso || Number.isNaN(Date.parse(startsAtIso))) {
    fieldErrors.startsAt = strings.admin.startsAtRequired;
  }

  // --- capacity / price -------------------------------------------------------
  const capacity = Number(text(form, "capacity"));
  if (!Number.isInteger(capacity) || capacity < 1) {
    fieldErrors.capacity = strings.admin.capacityInvalid;
  }

  const priceCzk = Number(text(form, "priceCzk"));
  if (!Number.isInteger(priceCzk) || priceCzk < 0) {
    fieldErrors.priceCzk = strings.admin.priceInvalid;
  }

  // --- optional detail --------------------------------------------------------
  const format = text(form, "format");
  if (format && !FORMAT_RE.test(format)) {
    fieldErrors.format = strings.admin.formatInvalid;
  }

  const surfaceRaw = text(form, "surface");
  const surface = SURFACES.includes(surfaceRaw as GameSurface)
    ? (surfaceRaw as GameSurface)
    : null;

  const notes = text(form, "notes");
  if (notes.length > NOTES_MAX) {
    fieldErrors.notes = strings.admin.notesTooLong;
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  return {
    ok: true,
    values: {
      venueId: isNewVenue ? null : venueChoice,
      newVenueName: newVenueName || null,
      newVenueImagePath: newVenueImage ? `/venues/${newVenueImage}` : null,
      newVenueMapQuery: newVenueMapQuery || null,
      startsAt: startsAtIso,
      capacity,
      priceCzk,
      format: format || null,
      surface,
      notes: notes || null,
    },
  };
}
