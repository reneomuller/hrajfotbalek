"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { AdminActionState } from "@/app/admin/games/actions";
import {
  DURATION_DEFAULT,
  DURATION_MAX,
  DURATION_MIN,
  ORGANIZER_NAME_MAX,
  SKILL_LEVELS,
  SUBS_MAX,
  SUBS_MIN,
  SURFACES,
} from "@/lib/admin/gameForm";
import { LanguagePill } from "@/components/game/LanguagePill";
import { gameLanguageOf, type GameLanguage } from "@/lib/games/language";
import { PASS_REFERENCE_PRICE_CZK } from "@/lib/pass/creditPrice";
import { strings } from "@/lib/strings";
import type { Database, GameSurface, SkillLevel } from "@/lib/types/database";

type VenueRow = Database["public"]["Tables"]["venues"]["Row"];

const INITIAL: AdminActionState = { status: "idle" };

const FIELD =
  "mt-1 w-full rounded-control border border-hairline-strong bg-surface px-3 py-2 text-[13px] text-bone";
const LABEL = "block text-[10px] uppercase tracking-eyebrow text-muted";
const HINT = "mt-1 text-[12px] leading-snug text-muted";
const ERROR = "mt-1 text-[12px] text-volt";

/**
 * Create/edit form for a game.
 *
 * KICK-OFF AND TIME ZONES. `<input type="datetime-local">` submits wall-clock
 * text with no zone attached. Rather than parse that on the server — where the
 * only zone available is the server's, which is not the organizer's — the
 * browser converts it to an absolute instant in a hidden ISO field, and the
 * action accepts only that. `parseGameForm` rejects a missing ISO value rather
 * than falling back, because a silent fallback moves a real game by an hour
 * twice a year.
 *
 * Everything this form validates is validated again by a CHECK constraint or
 * an RPC guard. The duplication buys a labelled inline error instead of a
 * constraint violation, and nothing else — the database is the authority.
 *
 * EVERY FIELD IS CONTROLLED, and that is a bug fix rather than a style choice.
 * React resets an uncontrolled `<form action={…}>` once the action returns, so
 * a submission rejected for one field used to wipe every other field back to
 * its `defaultValue` — the organizer saw the capacity and price they had just
 * typed replaced by the stored ones, which reads as "the form does not save"
 * rather than as "one field above is invalid". Controlled inputs survive the
 * reset, so a rejected submit leaves the work intact and only the error is new.
 */
export function GameForm({
  action,
  venues,
  game,
  organizer,
  defaultOrganizerName,
  canSetLanguage = false,
}: {
  action: (state: AdminActionState, formData: FormData) => Promise<AdminActionState>;
  venues: VenueRow[];
  /**
   * Every pitch name already in use, from `pitch_name_suggestions`
   * (migration 41). Suggestions only — the field is free text and works with
   * an empty list, which is its state until somebody types the first one.
   */
  /*
   * ~~`pitchNames` — the datalist of names already in use.~~ REMOVED with the
   * field (round 16, item 20). Kept OUT of the props rather than accepted and
   * ignored: a prop a component takes and does nothing with is one every
   * caller keeps computing.
   */
  /** Present when editing; absent when creating. */
  game?: {
    id: string;
    venue_id: string | null;
    starts_at: string;
    capacity: number;
    price_czk: number;
    format: string | null;
    surface: GameSurface | null;
    notes: string | null;
    duration_minutes: number | null;
    allowed_skill_levels: SkillLevel[] | null;
    subs_per_team: number | null;
    pitch_name: string | null;
    /** Round 18 item 2 — absent on a database without the migration. */
    language?: unknown;
  };
  /**
   * The stored contact when editing. Read server-side with the service-role
   * client, because `game_organizer_contacts` grants nothing to a session —
   * which is the whole point of the table (§5.1).
   */
  organizer?: { organizer_name: string; organizer_phone: string | null } | null;
  /**
   * The creating admin's nickname (REQ-GAME-001). A default, not a lock: the
   * person filling in the form is usually but not always the person running
   * the game.
   */
  defaultOrganizerName?: string;
  /** Whether `games.language` exists yet (round 18, item 2). */
  canSetLanguage?: boolean;
  /*
   * ~~`initialVenueChoice`, which pre-selected "new" for the dashboard's
   * `+ Add venue`.~~ REMOVED (round 14, item 2): there is no "new" option any
   * more, and `+ Add venue` goes to `/admin/venues`.
   */
}) {
  const [state, formAction] = useActionState(action, INITIAL);

  const [venueChoice, setVenueChoice] = useState(
    game?.venue_id ?? "",
  );


  // The visible wall-clock text and the absolute instant that is actually
  // submitted, kept as two pieces of state for the reason in the header.
  const [startsAtLocal, setStartsAtLocal] = useState(() =>
    game ? toLocalInputValue(game.starts_at) : "",
  );
  const [startsAtIso, setStartsAtIso] = useState(game?.starts_at ?? "");

  const [capacity, setCapacity] = useState(String(game?.capacity ?? 14));
  /*
   * THE PREFILL IS 150, NOT 200 (round 16, item 20).
   *
   * `PASS_REFERENCE_PRICE_CZK` rather than a literal: the credits ruling makes
   * one credit one game at 150 CZK, and the whole product divides balances by
   * that number. A form that proposes 200 was quietly inviting an organizer to
   * create games a credit does not cover — which is the one price at which the
   * wallet arithmetic stops meaning anything.
   */
  const [priceCzk, setPriceCzk] = useState(
    String(game?.price_czk ?? PASS_REFERENCE_PRICE_CZK),
  );
  const [format, setFormat] = useState(game?.format ?? "");
  const [surface, setSurface] = useState<string>(game?.surface ?? "");
  // Round 18 item 2 — resolved through `gameLanguageOf` so a pre-migration row
  // (no such property) reads as the column default rather than as undefined.
  const [language, setLanguage] = useState<GameLanguage>(gameLanguageOf(game?.language));
  const [notes, setNotes] = useState(game?.notes ?? "");

  const [organizerName, setOrganizerName] = useState(
    organizer?.organizer_name ?? defaultOrganizerName ?? "",
  );
  const [organizerPhone, setOrganizerPhone] = useState(organizer?.organizer_phone ?? "");
  // Blank when creating rather than pre-filled with 60: a number already in the
  // box is a number nobody chose, and null is a real answer that renders as the
  // standard length. The placeholder says what blank will mean.
  const [durationMinutes, setDurationMinutes] = useState(
    game?.duration_minutes != null ? String(game.duration_minutes) : "",
  );
  const [subsPerTeam, setSubsPerTeam] = useState(
    game?.subs_per_team != null ? String(game.subs_per_team) : "",
  );
  const [skillLevels, setSkillLevels] = useState<SkillLevel[]>(
    game?.allowed_skill_levels ?? [],
  );

  const errors = state.fieldErrors ?? {};
  const isEdit = Boolean(game);

  function toggleSkill(level: SkillLevel) {
    setSkillLevels((current) =>
      current.includes(level)
        ? current.filter((l) => l !== level)
        : SKILL_LEVELS.filter((l) => l === level || current.includes(l)),
    );
  }

  return (
    <form action={formAction} className="mt-6 max-w-[560px] space-y-5">
      {game && <input type="hidden" name="gameId" value={game.id} />}
      <input type="hidden" name="startsAtIso" value={startsAtIso} />

      {/* --- venue ------------------------------------------------------------ */}
      <div>
        <label className={LABEL} htmlFor="venueId">
          {strings.admin.venueLabel}
        </label>
        <select
          id="venueId"
          name="venueId"
          value={venueChoice}
          onChange={(event) => setVenueChoice(event.target.value)}
          className={FIELD}
          data-testid="venue-select"
        >
          <option value="">—</option>
          {venues.map((venue) => (
            <option key={venue.id} value={venue.id}>
              {venue.name}
            </option>
          ))}
        </select>
        {errors.venue && <p className={ERROR}>{errors.venue}</p>}
      </div>

      {/*
        ~~PITCH NAME — free text with a datalist of names already in use, empty
        meaning "use the venue's".~~ REMOVED (round 16, item 20), and it is a
        reversal of the round 8 / round 9 feature.

        THE PREMISE MOVED, WHICH IS WHY THE RULING DID (R31). Pitch name was
        added when a game named its own ground as free text and venues were
        barely an entity. Round 13 built `/admin/venues` with a `pitch_name` of
        its own, and round 14 made a game INHERIT its venue — at which point
        this box was a second place to say a thing the venue already says, on
        the screen where somebody is least likely to know the ground's real
        name.

        THE COLUMN AND THE RENDERING STAY. `games.pitch_name` is untouched and
        `venueDisplayName` still shows one where a game already carries it —
        deleting the display would blank a name on live fixtures to tidy a
        form. What is gone is the ability to set a NEW one per game: the venue
        is where a pitch is named, and `/admin/venues` is where that is edited.
      */}

      {/*
        ~~THE NEW-VENUE BLOCK: name, image filename and map query, revealed by
        picking "new" in the dropdown above.~~ REMOVED (round 14, item 2).

        THE VENUE IS THE SINGLE SOURCE OF TRUTH NOW. It is created and edited
        at `/admin/venues`, where its photograph is an UPLOAD rather than the
        name of a file somebody had to commit first, and where its amenities
        live beside it. A game picks a venue and inherits all of it.

        Two things this removes that were quietly wrong:

          · the image field asked for a filename already committed under
            `public/venues/`, which meant adding a venue photo was a deploy;
          · a game form could create a venue as a side effect, so the same
            ground could be typed twice under two spellings by two people
            making two games.

        THE PITCH NAME STAYS, directly above. It is the one venue-adjacent
        fact that belongs to THIS game — migration 41 exists because storing it
        on the venue would rewrite the pitch of every game ever played there.
      */}

      {/* --- when ------------------------------------------------------------- */}
      <div>
        <label className={LABEL} htmlFor="startsAt">
          {strings.admin.startsAtLabel}
        </label>
        <input
          id="startsAt"
          type="datetime-local"
          className={FIELD}
          data-testid="starts-at"
          value={startsAtLocal}
          onChange={(event) => {
            const value = event.target.value;
            setStartsAtLocal(value);
            const parsed = value ? new Date(value) : null;
            setStartsAtIso(parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : "");
          }}
        />
        {errors.startsAt && <p className={ERROR}>{errors.startsAt}</p>}
      </div>

      {/* --- capacity / price -------------------------------------------------- */}
      <div className="flex flex-wrap gap-4">
        <div className="min-w-[160px] flex-1">
          <label className={LABEL} htmlFor="capacity">
            {strings.admin.capacityLabel}
          </label>
          <input
            id="capacity"
            name="capacity"
            type="number"
            min={1}
            className={FIELD}
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
          />
          <p className={HINT}>{strings.admin.capacityHint}</p>
          {errors.capacity && <p className={ERROR}>{errors.capacity}</p>}
        </div>

        <div className="min-w-[160px] flex-1">
          <label className={LABEL} htmlFor="priceCzk">
            {strings.admin.priceLabel}
          </label>
          <input
            id="priceCzk"
            name="priceCzk"
            type="number"
            min={0}
            className={FIELD}
            value={priceCzk}
            onChange={(event) => setPriceCzk(event.target.value)}
          />
          <p className={HINT}>{strings.admin.priceHint}</p>
          {errors.priceCzk && <p className={ERROR}>{errors.priceCzk}</p>}
        </div>
      </div>

      {/* --- format / surface --------------------------------------------------- */}
      <div className="flex flex-wrap gap-4">
        <div className="min-w-[160px] flex-1">
          <label className={LABEL} htmlFor="format">
            {strings.admin.formatLabel}
          </label>
          <input
            id="format"
            name="format"
            className={FIELD}
            placeholder="6v6"
            value={format}
            onChange={(event) => setFormat(event.target.value)}
          />
          <p className={HINT}>{strings.admin.formatHint}</p>
          {errors.format && <p className={ERROR}>{errors.format}</p>}
        </div>

        <div className="min-w-[160px] flex-1">
          <label className={LABEL} htmlFor="surface">
            {strings.admin.surfaceLabel}
          </label>
          <select
            id="surface"
            name="surface"
            className={FIELD}
            value={surface}
            onChange={(event) => setSurface(event.target.value)}
          >
            <option value="">{strings.admin.surfaceNone}</option>
            {SURFACES.map((surface) => (
              <option key={surface} value={surface}>
                {strings.admin.surfaceOptions[surface]}
              </option>
            ))}
          </select>
          {/* Required since round 16 item 10 — see `lib/admin/gameForm.ts`. */}
          {errors.surface && <p className={ERROR}>{errors.surface}</p>}
        </div>
      </div>

      {/*
        LANGUAGE, BENEATH SURFACE (round 18, item 2).

        GATED ON THE MIGRATION. `games.language` arrives with round 18's
        migration and this form ships first, so without the column the field is
        not rendered at all — a submission then carries no `language` and
        `gameLanguageOf` resolves it to `en-cs`, which is exactly what every
        existing game is. Rendering a dropdown whose value the database would
        drop is the "Confirm is never live with a dead path behind it" rule
        applied to a select.

        THE OPTIONS ARE FLAG PAIRS, not words, which is the owner's format.
        A native `<select>` cannot hold SVG, so the flags are drawn ABOVE it as
        a live preview of the current value and the options carry the plain
        text a native picker can render. The preview is what the organizer
        checks; the option text is what the OS shows while choosing.
      */}
      {canSetLanguage && (
        <div className="min-w-[160px] flex-1">
          <label className={LABEL} htmlFor="language">
            {strings.admin.languageLabel}
          </label>

          <div className="mt-1 flex items-center gap-3">
            <LanguagePill language={language} />
            <select
              id="language"
              name="language"
              className={`${FIELD} mt-0 flex-1`}
              value={language}
              onChange={(event) => setLanguage(gameLanguageOf(event.target.value))}
            >
              <option value="en-cs">{strings.admin.languageEnCs}</option>
              <option value="uk-ru">{strings.admin.languageUkRu}</option>
            </select>
          </div>

          <p className={HINT}>{strings.admin.languageHint}</p>
        </div>
      )}

      {/* --- duration / substitutes ---------------------------------------------- */}
      <div className="flex flex-wrap gap-4">
        <div className="min-w-[160px] flex-1">
          <label className={LABEL} htmlFor="durationMinutes">
            {strings.admin.durationLabel}
          </label>
          <input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            min={DURATION_MIN}
            max={DURATION_MAX}
            className={FIELD}
            data-testid="duration-minutes"
            placeholder={String(DURATION_DEFAULT)}
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(event.target.value)}
          />
          <p className={HINT}>{strings.admin.durationHint}</p>
          {errors.durationMinutes && <p className={ERROR}>{errors.durationMinutes}</p>}
        </div>

        <div className="min-w-[160px] flex-1">
          <label className={LABEL} htmlFor="subsPerTeam">
            {strings.admin.subsLabel}
          </label>
          <input
            id="subsPerTeam"
            name="subsPerTeam"
            type="number"
            min={SUBS_MIN}
            max={SUBS_MAX}
            className={FIELD}
            data-testid="subs-per-team"
            value={subsPerTeam}
            onChange={(event) => setSubsPerTeam(event.target.value)}
          />
          <p className={HINT}>{strings.admin.subsHint}</p>
          {errors.subsPerTeam && <p className={ERROR}>{errors.subsPerTeam}</p>}
        </div>
      </div>

      {/* --- skill restriction ---------------------------------------------------- */}
      {/*
        CHECKBOXES, NOT A SELECT, and no "All levels" option among them.
        All-levels is the absence of a selection — the same shape as the NULL
        column — so there is one way to say it rather than an option that has
        to be kept in sync with an empty list.
      */}
      <fieldset className="rounded-card p-4">
        <legend className={LABEL}>{strings.admin.skillHeading}</legend>
        <div className="mt-2 flex flex-wrap gap-4">
          {SKILL_LEVELS.map((level) => (
            <label
              key={level}
              className="flex items-center gap-2 text-[13px] text-bone"
            >
              <input
                type="checkbox"
                name="allowedSkillLevels"
                value={level}
                data-testid={`skill-${level}`}
                checked={skillLevels.includes(level)}
                onChange={() => toggleSkill(level)}
                className="h-4 w-4 accent-volt"
              />
              {strings.admin.skillOptions[level]}
            </label>
          ))}
        </div>
        <p className={HINT}>{strings.admin.skillHint}</p>
        <p className={HINT}>{strings.admin.skillNote}</p>
      </fieldset>

      {/* --- organizer ------------------------------------------------------------ */}
      <fieldset className="rounded-card p-4">
        <legend className={LABEL}>{strings.admin.organizerHeading}</legend>

        <div className="mt-2">
          <label className={LABEL} htmlFor="organizerName">
            {strings.admin.organizerNameLabel}
          </label>
          <input
            id="organizerName"
            name="organizerName"
            className={FIELD}
            maxLength={ORGANIZER_NAME_MAX}
            data-testid="organizer-name"
            value={organizerName}
            onChange={(event) => setOrganizerName(event.target.value)}
          />
          <p className={HINT}>{strings.admin.organizerNameHint}</p>
          {errors.organizerName && <p className={ERROR}>{errors.organizerName}</p>}
        </div>

        <div className="mt-4">
          <label className={LABEL} htmlFor="organizerPhone">
            {strings.admin.organizerPhoneLabel}
          </label>
          <input
            id="organizerPhone"
            name="organizerPhone"
            type="tel"
            className={FIELD}
            maxLength={32}
            data-testid="organizer-phone"
            value={organizerPhone}
            onChange={(event) => setOrganizerPhone(event.target.value)}
          />
          <p className={HINT}>{strings.admin.organizerPhoneHint}</p>
          {errors.organizerPhone && <p className={ERROR}>{errors.organizerPhone}</p>}
        </div>
      </fieldset>

      {/* --- notes -------------------------------------------------------------- */}
      <div>
        <label className={LABEL} htmlFor="notes">
          {strings.admin.notesLabel}
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          maxLength={500}
          className={FIELD}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
        <p className={HINT}>{strings.admin.notesHint}</p>
        {errors.notes && <p className={ERROR}>{errors.notes}</p>}
      </div>

      <SubmitButton isEdit={isEdit} />
      {!isEdit && <p className={HINT}>{strings.admin.createGameHint}</p>}

      {state.status === "saved" && (
        <p data-testid="game-form-saved" className="text-[13px] text-volt">
          {strings.admin.saved}
        </p>
      )}
      {state.status === "error" && state.message && (
        <p role="alert" className="text-[13px] text-muted">
          {state.message}
        </p>
      )}
      {/*
        THE GAME EXISTS BUT IS NOT PUBLISHED (round 7, item 6).

        Creation and publication are two round trips; if the second fails the
        first still happened. Showing only "something went wrong" here invites
        a resubmit, which creates a SECOND game — so this says what actually
        exists and links to it, where one click finishes the job.
      */}
      {state.createdGameId && (
        <a
          href={`/admin/games/${state.createdGameId}`}
          data-testid="game-created-unpublished"
          className="text-[13px] font-semibold text-volt no-underline"
        >
          {strings.admin.createdNotPublished}
        </a>
      )}
    </form>
  );
}

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid="game-form-submit"
      className="w-full rounded-control bg-volt px-6 py-4 text-cta font-extrabold uppercase tracking-wide text-surface disabled:opacity-60"
    >
      {pending
        ? strings.common.loading
        : isEdit
          ? strings.admin.saveGame
          : strings.admin.createGame}
    </button>
  );
}

/**
 * ISO instant → the wall-clock string `datetime-local` expects.
 *
 * Runs in the browser, so `getHours()` and friends are the organizer's own
 * zone — which is the point: the field shows them the time they think in, and
 * the hidden ISO field carries the absolute instant.
 */
function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
