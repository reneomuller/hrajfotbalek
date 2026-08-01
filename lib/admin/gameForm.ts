import { policy } from "@/lib/policy";
import { strings } from "@/lib/strings";
import type { GameSurface, SkillLevel } from "@/lib/types/database";

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

/** Mirrors `games_duration_range` and `assert_game_shape`. */
export const DURATION_MIN = 30;
export const DURATION_MAX = 180;

/**
 * What the field is pre-filled with, per the v1.1.1 ruling: 60 is the standard
 * match length and 90 is the occasional per-game choice.
 *
 * Read from the policy module rather than written as 60 here, so the form's
 * default and the null-row fallback cannot drift apart — the same reasoning
 * that moved the `.ics` builder's private constant onto this value.
 */
export const DURATION_DEFAULT = policy.game.durationMinutes;

/** Mirrors `games_subs_range` and `assert_game_shape`. */
export const SUBS_MIN = 0;
export const SUBS_MAX = 20;

export const SKILL_LEVELS: SkillLevel[] = ["beginner", "intermediate", "advanced"];

/** Mirrors `organizer_name_length`. */
export const ORGANIZER_NAME_MAX = 60;

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
  /** Required (§5). The form pre-fills the creating admin's nickname. */
  organizerName: string;
  organizerPhone: string | null;
  durationMinutes: number | null;
  /**
   * Null means all levels and no badge. The RPC additionally collapses an
   * all-three selection to null, so "restricted to everything" cannot be
   * stored in one place and read as a restriction in another.
   */
  allowedSkillLevels: SkillLevel[] | null;
  subsPerTeam: number | null;
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

  // --- organizer (§5) ---------------------------------------------------------
  // The name is required. The form pre-fills the creating admin's nickname, so
  // the required-ness is almost never felt — but a game whose organizer is
  // blank is a game nobody is named as running, and the RPC refuses it too.
  const organizerName = text(form, "organizerName");
  if (!organizerName) {
    fieldErrors.organizerName = strings.admin.organizerNameRequired;
  } else if (organizerName.length > ORGANIZER_NAME_MAX) {
    fieldErrors.organizerName = strings.admin.organizerNameTooLong;
  }

  // An empty phone is the ABSENCE of a phone, not an empty one. Normalised to
  // null here and again in `set_game_organizer`, so "has a phone" is never
  // true for a game with nothing to call.
  const organizerPhone = text(form, "organizerPhone");
  if (organizerPhone && (organizerPhone.length < 3 || organizerPhone.length > 32)) {
    fieldErrors.organizerPhone = strings.admin.organizerPhoneInvalid;
  }

  // --- duration (§5.2) --------------------------------------------------------
  // Free numeric, bounded 30–180. Blank is allowed and means "not stated",
  // which renders as the policy fallback rather than as an error.
  const durationRaw = text(form, "durationMinutes");
  let durationMinutes: number | null = null;
  if (durationRaw) {
    const parsed = Number(durationRaw);
    if (
      !Number.isInteger(parsed) ||
      parsed < DURATION_MIN ||
      parsed > DURATION_MAX
    ) {
      fieldErrors.durationMinutes = strings.admin.durationInvalid;
    } else {
      durationMinutes = parsed;
    }
  }

  // --- substitutes (§5.3a) ----------------------------------------------------
  // 0 is meaningful ("no substitutes") and is why the floor is 0 rather than 1.
  const subsRaw = text(form, "subsPerTeam");
  let subsPerTeam: number | null = null;
  if (subsRaw) {
    const parsed = Number(subsRaw);
    if (!Number.isInteger(parsed) || parsed < SUBS_MIN || parsed > SUBS_MAX) {
      fieldErrors.subsPerTeam = strings.admin.subsInvalid;
    } else {
      subsPerTeam = parsed;
    }
  }

  // --- skill restriction (§5.3) -----------------------------------------------
  // Checkboxes, so an unticked form submits nothing at all. "All levels" is the
  // absence of a selection — one way to say it, matching the NULL column.
  const selected = form
    .getAll("allowedSkillLevels")
    .filter((v): v is string => typeof v === "string")
    .filter((v) => (SKILL_LEVELS as string[]).includes(v)) as SkillLevel[];

  const deduped = SKILL_LEVELS.filter((level) => selected.includes(level));
  // Every level ticked is the same statement as none ticked, and the RPC
  // stores NULL for both. Collapsing it here too keeps the value the form
  // round-trips identical to the value the database holds.
  const allowedSkillLevels =
    deduped.length === 0 || deduped.length === SKILL_LEVELS.length ? null : deduped;

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
      organizerName,
      organizerPhone: organizerPhone || null,
      durationMinutes,
      allowedSkillLevels,
      subsPerTeam,
    },
  };
}
