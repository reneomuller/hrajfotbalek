import { policy } from "@/lib/policy";
import { gameLanguageOf, type GameLanguage } from "@/lib/games/language";
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
/**
 * Two sides, or three. `6v6`, `7v7v7`.
 *
 * MIRRORS `games_format_format` (migration 35) and must keep mirroring it. The
 * database is the enforcement; this exists so an organizer is told at the field
 * rather than by a constraint-name error after submitting. The three-way was
 * added because eighteen players on one pitch is routinely run as 6v6v6 with
 * the losing side rotating off, and until now the only way to record that was
 * to leave the field blank.
 */
/*
 * UP TO FOUR GROUPS (round 18, item 9).
 *
 * ~~`(v[0-9]{1,2})?` — two or three.~~ The owner asked for `7v7v7v7` and this
 * refused it, which is half of why non-standard formats "did not update on the
 * card": they were never saved. The other half was that PRODUCTION's CHECK was
 * still the two-way-only one, so even `6v6v6` was rejected there — see the
 * round-18 migration.
 *
 * CAPPED RATHER THAN UNBOUNDED, and the cap is a rendering decision: the value
 * goes into a chip on a public card as typed, and `6v6v6v6v6v6` is a chip that
 * eats the row. Four covers every shape anybody runs on one pitch.
 *
 * MIRRORS `games_format_format`. The two must change together; the database is
 * the authority and this is what stops a doomed write leaving the browser.
 */
/** Telegram's own rule, mirroring `organizer_telegram_format`. */
const TELEGRAM_HANDLE_RE = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

const FORMAT_RE = /^[0-9]{1,2}v[0-9]{1,2}(v[0-9]{1,2}){0,2}$/;

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

/**
 * The pitch name's bound, mirroring `games_pitch_name_length` (migration 41).
 *
 * RESTATED RATHER THAN IMPORTED, like every other bound in this file: the
 * CHECK is the authority and this is the courtesy that reports the problem
 * beside the field instead of as an opaque constraint name. The two must move
 * together, which is why the constraint is named in this comment.
 */
export const PITCH_NAME_MAX = 60;

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
  /** Round 18 item 2. Always resolved — see `gameLanguageOf`. */
  language: GameLanguage;
  /** Round 19 item 2. Bare handle, or null. */
  organizerTelegram: string | null;
  notes: string | null;
  /** Required (§5). The form pre-fills the creating admin's nickname. */
  organizerName: string;
  organizerPhone: string | null;
  /**
   * This game's pitch, typed per game (migration 41).
   *
   * NULL MEANS "USE THE VENUE'S", which is what an empty box has to mean —
   * `venues.pitch_name` is the ground's default and a blank string stored here
   * would render as a stray separator through `venueDisplayName`.
   */
  pitchName: string | null;
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

  /*
   * SURFACE IS REQUIRED (round 16, item 10), and this is why.
   *
   * The owner asked for the surface badge to sit next to the format badge
   * "everywhere game boxes render". It already does — `CardBadges` puts them
   * in one row on the card and in one row on the detail. What was missing was
   * the DATA: the field was labelled "(optional)" and defaulted to "Not
   * specified", so production's one upcoming game carries `surface: null` and
   * draws no badge at all. Two rows apart would have been a layout bug; this
   * was a form that made the fact skippable.
   *
   * THE BADGE IS STILL NEVER INVENTED. v1.1.2 §5.3a rules against deriving
   * facts about a game, and nothing here derives one — it asks the organizer,
   * who knows, and refuses to save until they answer. That is the opposite of
   * inventing it.
   *
   * REQUIRED ON EDIT TOO, not just on create. A legacy game with no surface is
   * exactly the row whose badge is missing, and the person editing it is the
   * one person who can say. Letting the save through would preserve the gap
   * for the games that already have it.
   */
  /*
   * THE LANGUAGE (round 18, item 2). Absent is not an error: the field is not
   * rendered at all until the migration is applied, so a submission from that
   * world carries nothing and must still save. `gameLanguageOf` resolves it to
   * the column's own default, which is what those games already are.
   */
  const language = gameLanguageOf(text(form, "language"));

  /*
   * THE TELEGRAM HANDLE (round 19, item 2), normalised HERE ONLY to be
   * validated — the stored form is `normalize_telegram_handle`'s in SQL.
   *
   * TWO NORMALISATIONS WOULD BE TWO RULES. This one exists so the admin sees a
   * labelled inline error instead of a raw exception; the database's is the
   * authority, and a hand-made RPC call skips this entirely. Same relationship
   * every other field on this form has with its CHECK.
   */
  const telegramRaw = text(form, "organizerTelegram");
  const organizerTelegram = telegramRaw
    ? telegramRaw
        .trim()
        .replace(/^(https?:\/\/)?(www\.)?t\.me\//i, "")
        .replace(/^@+/, "")
        .trim() || null
    : null;

  if (organizerTelegram && !TELEGRAM_HANDLE_RE.test(organizerTelegram)) {
    fieldErrors.organizerTelegram = strings.admin.organizerTelegramInvalid;
  }

  const surfaceRaw = text(form, "surface");
  const surface = SURFACES.includes(surfaceRaw as GameSurface)
    ? (surfaceRaw as GameSurface)
    : null;
  if (!surface) {
    fieldErrors.surface = strings.admin.surfaceRequired;
  }

  const pitchName = text(form, "pitchName");
  if (pitchName.length > PITCH_NAME_MAX) {
    fieldErrors.pitchName = strings.admin.pitchNameTooLong;
  }

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
      language,
      organizerTelegram,
      notes: notes || null,
      organizerName,
      organizerPhone: organizerPhone || null,
      pitchName: pitchName || null,
      durationMinutes,
      allowedSkillLevels,
      subsPerTeam,
    },
  };
}
