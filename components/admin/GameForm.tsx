"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { AdminActionState } from "@/app/admin/games/actions";
import { SURFACES } from "@/lib/admin/gameForm";
import { strings } from "@/lib/strings";
import type { Database, GameSurface } from "@/lib/types/database";

type VenueRow = Database["public"]["Tables"]["venues"]["Row"];

const INITIAL: AdminActionState = { status: "idle" };

const FIELD =
  "mt-1 w-full rounded-control border border-hairline-strong bg-surface px-3 py-2 font-mono text-[13px] text-bone";
const LABEL = "block font-mono text-[10px] uppercase tracking-eyebrow text-muted";
const HINT = "mt-1 text-[12px] leading-snug text-muted-dim";
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
}: {
  action: (state: AdminActionState, formData: FormData) => Promise<AdminActionState>;
  venues: VenueRow[];
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
  };
}) {
  const [state, formAction] = useActionState(action, INITIAL);

  const [venueChoice, setVenueChoice] = useState(game?.venue_id ?? "");
  const [newVenueName, setNewVenueName] = useState("");
  const [newVenueImage, setNewVenueImage] = useState("");
  const [newVenueMapQuery, setNewVenueMapQuery] = useState("");

  // The visible wall-clock text and the absolute instant that is actually
  // submitted, kept as two pieces of state for the reason in the header.
  const [startsAtLocal, setStartsAtLocal] = useState(() =>
    game ? toLocalInputValue(game.starts_at) : "",
  );
  const [startsAtIso, setStartsAtIso] = useState(game?.starts_at ?? "");

  const [capacity, setCapacity] = useState(String(game?.capacity ?? 14));
  const [priceCzk, setPriceCzk] = useState(String(game?.price_czk ?? 200));
  const [format, setFormat] = useState(game?.format ?? "");
  const [surface, setSurface] = useState<string>(game?.surface ?? "");
  const [notes, setNotes] = useState(game?.notes ?? "");

  const errors = state.fieldErrors ?? {};
  const isEdit = Boolean(game);

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
          <option value="new">{strings.admin.venueNew}</option>
        </select>
        {errors.venue && <p className={ERROR}>{errors.venue}</p>}
      </div>

      {venueChoice === "new" && (
        <div className="space-y-4 rounded-card border border-hairline-volt-soft bg-surface-card p-4">
          <div>
            <label className={LABEL} htmlFor="newVenueName">
              {strings.admin.venueNameLabel}
            </label>
            <input
              id="newVenueName"
              name="newVenueName"
              className={FIELD}
              maxLength={80}
              value={newVenueName}
              onChange={(event) => setNewVenueName(event.target.value)}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="newVenueImage">
              {strings.admin.venueImageLabel}
            </label>
            {/*
              A FILENAME, not a path or a URL. The action prefixes `/venues/`,
              so the directory is never user input, and the filename shape is
              checked here, in the action, and by the venues_image_path_format
              CHECK. Images are committed assets — nothing is uploaded.
            */}
            <input
              id="newVenueImage"
              name="newVenueImage"
              className={FIELD}
              placeholder="prazacka.jpg"
              value={newVenueImage}
              onChange={(event) => setNewVenueImage(event.target.value)}
            />
            <p className={HINT}>{strings.admin.venueImageHint}</p>
          </div>
          <div>
            <label className={LABEL} htmlFor="newVenueMapQuery">
              {strings.admin.venueMapQueryLabel}
            </label>
            <input
              id="newVenueMapQuery"
              name="newVenueMapQuery"
              className={FIELD}
              value={newVenueMapQuery}
              onChange={(event) => setNewVenueMapQuery(event.target.value)}
            />
            <p className={HINT}>{strings.admin.venueMapQueryHint}</p>
          </div>
        </div>
      )}

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
        </div>
      </div>

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
      className="w-full rounded-cta bg-volt px-6 py-4 font-condensed text-cta font-extrabold uppercase tracking-wide text-surface disabled:opacity-60"
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
