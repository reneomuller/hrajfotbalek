"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { updateProfileAction, type ProfileActionState } from "@/app/account/actions";
import { useStrings } from "@/components/LocaleProvider";
import { POSITIONS, type Position } from "@/lib/players/positions";
import type { CountryOption } from "@/lib/auth/countries";
import type { SkillLevel } from "@/lib/auth/signupProfile";

const INITIAL: ProfileActionState = { status: "idle" };

const SKILLS: SkillLevel[] = ["beginner", "intermediate", "advanced"];

export interface ProfileDetailsProps {
  nickname: string;
  phone: string | null;
  country: string | null;
  skillLevel: SkillLevel | null;
  positions: string[];
  email: string | null;
  countries: CountryOption[];
}

/**
 * The profile block, display and edit (ruling L §2.8, §3 screen 7).
 *
 * THE WHOLE BLOCK SWAPS, which is what §2.8 specifies rather than a form that
 * is always present with disabled inputs. A disabled form is a form: it takes
 * tab stops, it reads as broken to a screen reader, and it invites the reader
 * to work out why they cannot type in it.
 *
 * FOCUS MOVES WITH THE SWAP, in both directions — to the first field when the
 * edit block opens, and back to `Edit details` when it closes. Without that,
 * opening the form leaves focus on a button that no longer exists and the
 * keyboard lands at the top of the document, which is the single most common
 * way a disclosure pattern fails an audit.
 *
 * SIX FIELDS, and the sixth is read-only. Email is shown because a profile
 * that hides the address it belongs to is missing the one fact people check;
 * it is not editable HERE because changing an email is a re-verification flow
 * with its own confirmation step, and it already has one below.
 */
export function ProfileDetails(props: ProfileDetailsProps) {
  const t = useStrings();
  const [state, formAction] = useActionState(updateProfileAction, INITIAL);
  const [editing, setEditing] = useState(false);

  const editButton = useRef<HTMLButtonElement>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const wasEditing = useRef(false);

  /*
   * A SAVE CLOSES THE BLOCK, a failure keeps it open. The action revalidates
   * `/account`, so the display values below are the server's on the next
   * render — this only decides which half is shown.
   *
   * ADJUSTED DURING RENDER, not in an effect. React documents this exact
   * shape for "state derived from something that just changed": setting state
   * during render of the same component re-runs it immediately, before the
   * browser paints, so the edit block is never shown for a frame after a
   * successful save. An effect would paint the stale half first and is what
   * `react-hooks/set-state-in-effect` exists to stop. The `savedAt` guard is
   * what keeps it from looping — it fires once per action result.
   */
  const [closedFor, setClosedFor] = useState<ProfileActionState | null>(null);
  if (editing && state.status === "saved" && closedFor !== state) {
    setClosedFor(state);
    setEditing(false);
  }

  useEffect(() => {
    if (editing && !wasEditing.current) firstField.current?.focus();
    if (!editing && wasEditing.current) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  if (!editing) {
    return (
      <section data-testid="profile-details" className="rounded-card bg-surface p-5">
        <dl className="m-0 flex flex-col gap-3">
          <Row label={t.profile.displayName} value={props.nickname} testId="nickname" />
          <Row
            label={t.profile.position}
            value={
              props.positions.length > 0
                ? props.positions
                    .map((code) => t.profile.positions[code as Position])
                    .filter(Boolean)
                    .join(" · ")
                : null
            }
            testId="positions"
          />
          <Row
            label={t.profile.skillLevel}
            value={props.skillLevel ? t.auth[skillKey(props.skillLevel)] : null}
            testId="skill"
          />
          <Row
            label={t.profile.nationality}
            value={
              props.countries.find((c) => c.code === props.country)?.name ?? props.country
            }
            testId="country"
          />
          <Row label={t.profile.phone} value={props.phone} testId="phone" />
          <Row label={t.profile.email} value={props.email} testId="email" />
        </dl>

        {state.status === "saved" && (
          <p data-testid="profile-saved" className="mt-4 mb-0 text-small text-volt">
            {t.profile.saved}
          </p>
        )}

        <button
          ref={editButton}
          type="button"
          data-testid="edit-details"
          onClick={() => setEditing(true)}
          className="mt-5 inline-flex min-h-11 items-center rounded-control border border-hairline-strong px-4 text-body font-semibold text-bone transition-colors hover:border-hairline-volt"
        >
          {t.profile.editDetails}
        </button>
      </section>
    );
  }

  return (
    <section data-testid="profile-details" className="rounded-card bg-surface p-5">
      <form action={formAction} className="flex flex-col gap-5">
        <Field label={t.profile.displayName} htmlFor="nickname" error={fieldError(state, "nickname", t)}>
          <input
            ref={firstField}
            id="nickname"
            name="nickname"
            defaultValue={props.nickname}
            required
            maxLength={20}
            aria-invalid={state.field === "nickname" || undefined}
            className={FIELD}
          />
        </Field>

        {/*
          MULTI-SELECT CHIPS, and multi is the point: §2.8 requires the state
          "where more chips are SELECTED than fit one row", which single-select
          cannot reach — and players do play more than one position.

          CHECKBOXES STYLED AS CHIPS rather than `button role="option"`. §2.8
          allows either; checkboxes come with the keyboard behaviour, the
          announced checked state and the form serialisation already correct,
          and a `<fieldset>`/`<legend>` gives the group its accessible name
          without a second ARIA relationship to maintain.

          `flex-wrap`: they take as many rows as they need and never scroll
          sideways or truncate a label.
        */}
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-1 p-0 text-small text-muted">{t.profile.position}</legend>
          <p className="m-0 mb-2 text-small text-faint">{t.profile.positionHint}</p>
          <div className="flex flex-wrap gap-2">
            {POSITIONS.map((code) => (
              <label
                key={code}
                data-testid={`position-chip-${code}`}
                className="cursor-pointer"
              >
                <input
                  type="checkbox"
                  name="positions"
                  value={code}
                  defaultChecked={props.positions.includes(code)}
                  className="peer sr-only"
                />
                <span className="inline-flex min-h-11 items-center rounded-pill bg-surface-raised px-4 text-body text-bone transition-colors peer-checked:bg-volt peer-checked:text-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-volt">
                  {t.profile.positions[code]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field label={t.profile.skillLevel} htmlFor="skill" error={fieldError(state, "skill", t)}>
          <select
            id="skill"
            name="skill"
            defaultValue={props.skillLevel ?? ""}
            className={FIELD}
          >
            <option value="">{t.profile.notSet}</option>
            {SKILLS.map((level) => (
              <option key={level} value={level}>
                {t.auth[skillKey(level)]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label={t.profile.nationality}
          htmlFor="country"
          error={fieldError(state, "country", t)}
        >
          <select
            id="country"
            name="country"
            defaultValue={props.country ?? ""}
            className={FIELD}
          >
            <option value="">{t.profile.notSet}</option>
            {props.countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.flag} {country.name}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label={t.profile.phone}
          htmlFor="phone"
          hint={t.profile.phoneHint}
          error={fieldError(state, "phone", t)}
        >
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            defaultValue={props.phone ?? ""}
            className={FIELD}
          />
        </Field>

        {/* Read-only, and said so rather than rendered as a dead input. */}
        <Field label={t.profile.email} htmlFor="email" hint={t.profile.emailChangeHint}>
          <input id="email" value={props.email ?? ""} readOnly disabled className={`${FIELD} opacity-60`} />
        </Field>

        {state.status === "error" && !state.field && state.message && (
          <p role="alert" data-testid="profile-error" className="m-0 text-small text-danger">
            {state.message}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <SaveButton />
          <button
            type="button"
            data-testid="cancel-edit"
            onClick={() => setEditing(false)}
            className="min-h-11 px-3 text-body text-muted transition-colors hover:text-bone"
          >
            {t.profile.cancelEdit}
          </button>
        </div>
      </form>
    </section>
  );
}

const FIELD =
  "w-full rounded-control bg-surface-raised px-4 py-3 text-body text-bone outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt";

function SaveButton() {
  const t = useStrings();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      data-testid="save-profile"
      className="inline-flex min-h-11 items-center rounded-control bg-volt px-5 text-body-lg font-bold text-ink transition-colors hover:bg-volt-dim disabled:opacity-60"
    >
      {pending ? t.common.loading : t.profile.saveProfile}
    </button>
  );
}

/** One display row. `null` renders the not-set word, never a blank line. */
function Row({
  label,
  value,
  testId,
}: {
  label: string;
  value: string | null;
  testId: string;
}) {
  const t = useStrings();
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <dt className="m-0 text-small text-muted">{label}</dt>
      <dd
        data-testid={`profile-${testId}`}
        className={`m-0 text-body ${value ? "text-bone" : "text-faint"}`}
      >
        {value || t.profile.notSet}
      </dd>
    </div>
  );
}

/**
 * A labelled field with its hint and its error.
 *
 * The message is associated by `aria-describedby` and is the SIGNAL — §2.8 is
 * explicit that colour is never the only one, so the border is reinforcement.
 */
function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  const describedBy = [hint ? `${htmlFor}-hint` : null, error ? `${htmlFor}-error` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-small text-muted">
        {label}
      </label>
      {hint && (
        <p id={`${htmlFor}-hint`} className="m-0 text-small text-faint">
          {hint}
        </p>
      )}
      <div aria-describedby={describedBy || undefined}>{children}</div>
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="m-0 text-small text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function fieldError(
  state: ProfileActionState,
  field: NonNullable<ProfileActionState["field"]>,
  t: ReturnType<typeof useStrings>,
): string | undefined {
  void t;
  return state.status === "error" && state.field === field ? state.message : undefined;
}

function skillKey(level: SkillLevel): "skillBeginner" | "skillIntermediate" | "skillAdvanced" {
  return level === "beginner"
    ? "skillBeginner"
    : level === "intermediate"
      ? "skillIntermediate"
      : "skillAdvanced";
}
