"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { AdminActionState } from "@/app/admin/games/actions";
import {
  DURATION_DEFAULT,
  DURATION_STANDARD,
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
import { priceForDurationCzk } from "@/lib/games/price";
import { phoneAfterOrganizerChange } from "@/lib/admin/organizerPhone";
import { strings } from "@/lib/strings";
import type { Database, GameSurface, SkillLevel } from "@/lib/types/database";

type VenueRow = Database["public"]["Tables"]["venues"]["Row"];

const INITIAL: AdminActionState = { status: "idle" };

/*
 * `min-h-11` (audit F6). Every text input, number input and datetime field on
 * the admin forms measured 37.5px — `py-2` around 13px type. The floor this
 * product states is 44, and an admin filling in a game on a phone is the
 * person most likely to mis-tap: the fields sit directly above and below each
 * other with 4px between them.
 *
 * `min-h-11` rather than more padding, so a field that WRAPS (a long venue
 * name in the select) grows from its content instead of being pinned.
 */
const FIELD =
  "mt-1 min-h-11 w-full rounded-control border border-hairline-strong bg-surface px-3 py-2 text-[13px] text-bone outline-none transition-colors placeholder:text-faint focus:border-volt";
const LABEL = "block text-[10px] uppercase tracking-eyebrow text-muted";
const HINT = "mt-1 text-[12px] leading-snug text-muted";
const ERROR = "mt-1 text-[12px] text-volt";

/*
 * ROUND 42 — THE FORM IN SECTIONS. Every field is where it was in meaning and
 * nowhere new in behaviour; what changed is that the fifteen of them are
 * grouped by the question each answers (where and when, how long and how much,
 * what kind of game, who may play, who runs it), and the groups sit two-up
 * from `md` instead of one 560px column in a 980px shell.
 *
 * A FLOATED LEGEND, so it lays out as the group's heading rather than notching
 * the fieldset's top edge, and the content after it clears the float.
 */
const GROUP = "min-w-0 rounded-card bg-surface p-4";
const LEGEND = "float-left mb-3 w-full text-[10px] uppercase tracking-eyebrow text-volt-dim";
const hub = strings.admin.gamesHub;

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
  canSetTelegram = false,
  organizerPlayers,
  defaultOrganizerPlayerId,
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
  organizer?: {
    organizer_name: string;
    organizer_phone: string | null;
    organizer_telegram?: string | null;
    organizer_player_id?: string | null;
  } | null;
  /**
   * The creating admin's nickname (REQ-GAME-001). A default, not a lock: the
   * person filling in the form is usually but not always the person running
   * the game.
   */
  defaultOrganizerName?: string;
  /** Whether `games.language` exists yet (round 18, item 2). */
  canSetLanguage?: boolean;
  /** Whether `organizer_telegram` exists yet (round 19, item 2). */
  canSetTelegram?: boolean;
  /**
   * Round 42 — the players an admin can pick as organizer, or absent before
   * `20261102100000` lands; the picker renders only when this is given.
   */
  organizerPlayers?: { id: string; nickname: string; phone: string | null }[];
  /** The creating admin's player id — the picker's default on a new game. */
  defaultOrganizerPlayerId?: string;
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
  /*
   * A TYPED PRICE, PREFILLED BY THE DURATION (round 36, item 2).
   *
   * ~~Derived and read-only.~~ Round 35 v5 made the length decide the price
   * outright; the owner has refined it to a DEFAULT. The organizer types what
   * they like and the card is charged exactly that — `admin_create_game_v2`
   * stores what it is sent again.
   *
   * CHANGING THE DURATION RE-PREFILLS THE FIELD, and overwrites a customised
   * number when it does. That is the owner's call and it is the simplest honest
   * behaviour: the alternative is a form that remembers whether a value was
   * "chosen" or "suggested" and silently declines to update it, which is a
   * rule nobody can see. If the organizer had customised the price, they retype
   * it after changing the length — one visible step rather than an invisible
   * one.
   *
   * WHAT THE PRICE DOES NOT DECIDE is whether a credit can buy the game: since
   * round 40 a Credit buys a seat on ANY game, whatever its length or price.
   */
  const [format, setFormat] = useState(game?.format ?? "");
  const [surface, setSurface] = useState<string>(game?.surface ?? "");
  // Round 18 item 2 — resolved through `gameLanguageOf` so a pre-migration row
  // (no such property) reads as the column default rather than as undefined.
  const [language, setLanguage] = useState<GameLanguage>(gameLanguageOf(game?.language));
  const [organizerTelegram, setOrganizerTelegram] = useState(
    organizer?.organizer_telegram ?? "",
  );
  const [notes, setNotes] = useState(game?.notes ?? "");

  const [organizerName, setOrganizerName] = useState(
    organizer?.organizer_name ?? defaultOrganizerName ?? "",
  );
  // Round 42 — the dropdown. Editing keeps who runs the game; a new game starts
  // on the creating admin when they are an organizer, otherwise on "Choose".
  const pickable = organizerPlayers ?? [];
  const [organizerPlayerId, setOrganizerPlayerId] = useState(() => {
    const wanted = organizer ? (organizer.organizer_player_id ?? "") : (defaultOrganizerPlayerId ?? "");
    return pickable.some((player) => player.id === wanted) ? wanted : "";
  });
  const pickedNickname = pickable.find((player) => player.id === organizerPlayerId)?.nickname ?? "";
  const phoneOf = (playerId: string) => pickable.find((player) => player.id === playerId)?.phone ?? null;
  // Editing keeps the stored number; a new game starts on the preselected
  // organizer's own (round 42 — "pre-fill their phone number").
  const [organizerPhone, setOrganizerPhone] = useState(
    () => (organizer ? (organizer.organizer_phone ?? "") : (phoneOf(organizerPlayerId) ?? "")),
  );
  // ~~Blank when creating~~ — ROUND 40: a NEW game starts at the standard
  // ninety minutes, because the owner's standard game is 90 and a blank box
  // still means the 60-minute fallback history was written under. Editing a
  // legacy row with no length keeps it blank.
  const [durationMinutes, setDurationMinutes] = useState(
    game?.duration_minutes != null
      ? String(game.duration_minutes)
      : game
        ? ""
        : String(DURATION_STANDARD),
  );
  /*
   * WHAT THE LENGTH SUGGESTS. A blank duration is the standard length — which
   * is what the placeholder under that field already says — so a blank form
   * proposes the 60-minute price rather than nothing.
   */
  const prefillForDuration = (minutes: string) =>
    String(priceForDurationCzk(minutes.trim() === "" ? null : Number(minutes)));

  const [priceCzk, setPriceCzk] = useState(
    game?.price_czk != null
      ? String(game.price_czk)
      : prefillForDuration(game?.duration_minutes != null ? String(game.duration_minutes) : ""),
  );

  /*
   * THE PREFILL IS DONE IN THE DURATION HANDLER, NOT IN AN EFFECT.
   *
   * An effect watching `durationMinutes` would also fire on mount and on every
   * re-render that touched it, overwriting a price the organizer had typed for
   * reasons they never triggered. Writing it where the CHANGE happens means the
   * field moves exactly when somebody edits the length, which is the rule as
   * stated and the only one a reader can predict.
   */
  const onDurationChange = (minutes: string) => {
    setDurationMinutes(minutes);
    setPriceCzk(prefillForDuration(minutes));
  };

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
    <form action={formAction} className="space-y-4">
      {game && <input type="hidden" name="gameId" value={game.id} />}
      <input type="hidden" name="startsAtIso" value={startsAtIso} />

      <div className="grid gap-4 md:grid-cols-2">
        {/* --- where and when ------------------------------------------------- */}
        <fieldset className={GROUP}>
          <legend className={LEGEND}>{hub.formWhere}</legend>
          <div className="clear-both space-y-4">
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
              ~~PITCH NAME~~ and ~~THE NEW-VENUE BLOCK~~ — REMOVED (round 16 item
              20, round 14 item 2). The venue is the single source of truth: it
              is created, named and photographed at `/admin/venues`, and a game
              picks one and inherits all of it.
            */}

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
          </div>
        </fieldset>

        {/* --- length, price, seats ------------------------------------------- */}
        <fieldset className={GROUP}>
          <legend className={LEGEND}>{hub.formSeats}</legend>
          {/* The length first, because it refills the price beside it. */}
          <div className="clear-both grid gap-4 sm:grid-cols-2">
            <div className="min-w-0">
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
                onChange={(event) => onDurationChange(event.target.value)}
              />
              <p className={HINT}>{strings.admin.durationHint}</p>
              {errors.durationMinutes && <p className={ERROR}>{errors.durationMinutes}</p>}
            </div>

            <div className="min-w-0">
              <label className={LABEL} htmlFor="priceCzk">
                {strings.admin.priceLabel}
              </label>
              <input
                id="priceCzk"
                name="priceCzk"
                type="number"
                min={1}
                step={1}
                data-testid="price-czk"
                className={FIELD}
                value={priceCzk}
                onChange={(event) => setPriceCzk(event.target.value)}
              />
              <p className={HINT}>{strings.admin.priceDerivedHint}</p>
              {errors.priceCzk && <p className={ERROR}>{errors.priceCzk}</p>}
            </div>

            <div className="min-w-0">
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

            <div className="min-w-0">
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
        </fieldset>

        {/* --- the game itself ------------------------------------------------- */}
        <fieldset className={GROUP}>
          <legend className={LEGEND}>{hub.formGame}</legend>
          <div className="clear-both space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="min-w-0">
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

              <div className="min-w-0">
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
              LANGUAGE (round 18, item 2), GATED ON THE MIGRATION: without
              `games.language` the field is not rendered at all, and a submission
              then resolves to `en-cs`, which is what every existing game is.

              THE OPTIONS ARE FLAG PAIRS, not words, which is the owner's format.
              A native `<select>` cannot hold SVG, so the flags are drawn beside
              it as a live preview and the options carry plain text.
            */}
            {canSetLanguage && (
              <div className="min-w-0">
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
          </div>
        </fieldset>

        {/* --- skill restriction ------------------------------------------------ */}
        {/*
          CHECKBOXES, NOT A SELECT, and no "All levels" option among them.
          All-levels is the absence of a selection — the same shape as the NULL
          column — so there is one way to say it.
        */}
        <fieldset className={GROUP}>
          <legend className={LEGEND}>{strings.admin.skillHeading}</legend>
          <div className="clear-both">
            <div className="flex flex-wrap gap-x-4">
              {SKILL_LEVELS.map((level) => (
                <label
                  key={level}
                  /* `min-h-11` (audit F14): the label is what a pointer hits; the
                     box stays 16px. */
                  className="flex min-h-11 items-center gap-2 text-[13px] text-bone"
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
          </div>
        </fieldset>

        {/* --- organizer ---------------------------------------------------------- */}
        <fieldset className={`${GROUP} md:col-span-2`}>
          <legend className={LEGEND}>{strings.admin.organizerHeading}</legend>

          <div className="clear-both grid gap-4 md:grid-cols-3">
            {/*
              A DROPDOWN OF ORGANIZERS (round 42, the owner: "for each game we
              create, there should simply be a dropdown of the users we gave
              organizer status to"). The chosen player's nickname is posted as
              `organizerName` and re-read on the server. The typed name is what
              remains before the migration, and while nobody has been made an
              organizer yet — a form that cannot name anyone cannot make a game.
            */}
            {pickable.length > 0 ? (
              <div className="min-w-0">
                <label className={LABEL} htmlFor="organizerPlayerId">
                  {strings.admin.organizerPlayerLabel}
                </label>
                <select
                  id="organizerPlayerId"
                  name="organizerPlayerId"
                  data-testid="organizer-player"
                  required
                  className={FIELD}
                  value={organizerPlayerId}
                  onChange={(event) => {
                    const next = event.target.value;
                    setOrganizerPhone((current) =>
                      phoneAfterOrganizerChange(current, phoneOf(organizerPlayerId), phoneOf(next)),
                    );
                    setOrganizerPlayerId(next);
                  }}
                >
                  <option value="" disabled>
                    {strings.admin.organizerPlayerChoose}
                  </option>
                  {pickable.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.nickname}
                    </option>
                  ))}
                </select>
                <input type="hidden" name="organizerName" value={pickedNickname} />
                <p className={HINT}>{strings.admin.organizerPlayerHint}</p>
                {errors.organizerName && <p className={ERROR}>{errors.organizerName}</p>}
              </div>
            ) : (
              <div className="min-w-0">
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
                <p className={HINT}>
                  {organizerPlayers ? strings.admin.organizerPlayerNoneYet : strings.admin.organizerNameHint}
                </p>
                {errors.organizerName && <p className={ERROR}>{errors.organizerName}</p>}
              </div>
            )}

            <div className="min-w-0">
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
              <p className={HINT}>
                {pickable.length > 0 ? strings.admin.organizerPhonePrefilled : strings.admin.organizerPhoneHint}
              </p>
              {errors.organizerPhone && <p className={ERROR}>{errors.organizerPhone}</p>}
            </div>

            {/*
              TELEGRAM USERNAME (round 19, item 2), GATED ON THE MIGRATION — a
              field whose value is silently discarded is worse than no field.
              Setting it turns a Ukrainian/Russian game's contact button from
              WhatsApp into Telegram, which the hint says.
            */}
            {canSetTelegram && (
              <div className="min-w-0">
                <label className={LABEL} htmlFor="organizerTelegram">
                  {strings.admin.organizerTelegramLabel}
                </label>
                <input
                  id="organizerTelegram"
                  name="organizerTelegram"
                  className={FIELD}
                  autoComplete="off"
                  placeholder="@oliver_hf"
                  value={organizerTelegram}
                  onChange={(event) => setOrganizerTelegram(event.target.value)}
                />
                <p className={HINT}>{strings.admin.organizerTelegramHint}</p>
                {errors.organizerTelegram && <p className={ERROR}>{errors.organizerTelegram}</p>}
              </div>
            )}
          </div>
        </fieldset>

        {/* --- notes -------------------------------------------------------------- */}
        <div className={`${GROUP} md:col-span-2`}>
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
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-5">
        <SubmitButton isEdit={isEdit} />
        {!isEdit && <p className={`${HINT} md:mt-0`}>{strings.admin.createGameHint}</p>}

        {state.status === "saved" && (
          <p data-testid="game-form-saved" className="m-0 text-[13px] text-volt">
            {strings.admin.saved}
          </p>
        )}
        {state.status === "error" && state.message && (
          <p role="alert" className="m-0 text-[13px] text-muted">
            {state.message}
          </p>
        )}
        {/*
          THE GAME EXISTS BUT IS NOT PUBLISHED (round 7, item 6). Creation and
          publication are two round trips; if the second fails the first still
          happened. "Something went wrong" here would invite a resubmit, which
          creates a SECOND game — so this says what exists and links to it.
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
      </div>
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
      className="w-full shrink-0 rounded-control bg-volt px-6 py-4 text-cta font-extrabold uppercase tracking-wide text-surface disabled:opacity-60 md:w-auto md:min-w-[280px]"
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
