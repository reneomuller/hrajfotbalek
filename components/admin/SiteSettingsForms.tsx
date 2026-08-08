"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  setActivePlayersAction,
  setGamesPerWeekAction,
  setPlayerOfMonthAction,
  type SiteSettingState,
} from "@/app/admin/site/actions";
import { strings } from "@/lib/strings";

const INITIAL: SiteSettingState = { status: "idle" };

const FIELD =
  "mt-1 w-full rounded-control border border-hairline-strong bg-surface px-3 py-2 text-[13px] text-bone";
const LABEL = "block text-[10px] uppercase tracking-eyebrow text-muted";
const HINT = "mt-1 text-[12px] leading-snug text-muted";

/**
 * The three site-setting forms.
 *
 * ONE FORM PER SETTING, rather than one form saving all of them. They are
 * edited on completely different cadences — the two claims move a few times a
 * year, the Player of the Month once a month — and one combined save would mean
 * re-submitting values nobody was looking at, which is how a number gets
 * overwritten by a stale render.
 *
 * Both inputs are CONTROLLED, for the reason `GameForm` documents: React
 * resets an uncontrolled `<form action={…}>` once the action returns, so a
 * rejected submit would wipe what the admin typed and read as "the form does
 * not save".
 *
 * Admin copy is English only — see `lib/i18n/locales.ts`.
 */
export function SiteSettingsForms({
  activePlayers,
  gamesPerWeek,
  players,
  currentPlayerOfMonth,
}: {
  activePlayers: number | null;
  gamesPerWeek: number | null;
  players: { id: string; nickname: string }[];
  currentPlayerOfMonth: string | null;
}) {
  return (
    <div className="mt-6 max-w-[560px] space-y-8">
      <NumberForm
        action={setGamesPerWeekAction}
        name="gamesPerWeek"
        current={gamesPerWeek}
        label={strings.admin.siteGamesPerWeekLabel}
        hint={strings.admin.siteGamesPerWeekHint}
        submitLabel={strings.admin.siteGamesPerWeekSubmit}
        testId="games-per-week"
      />
      <NumberForm
        action={setActivePlayersAction}
        name="activePlayers"
        current={activePlayers}
        label={strings.admin.siteActivePlayersLabel}
        hint={strings.admin.siteActivePlayersHint}
        submitLabel={strings.admin.siteActivePlayersSubmit}
        testId="active-players"
      />
      <PlayerOfMonthForm players={players} current={currentPlayerOfMonth} />
    </div>
  );
}

/**
 * One numeric claim. Shared by both, because they differ only in their copy —
 * two near-identical form components is how one of them keeps a `min` the other
 * loses.
 */
function NumberForm({
  action,
  name,
  current,
  label,
  hint,
  submitLabel,
  testId,
}: {
  action: (state: SiteSettingState, formData: FormData) => Promise<SiteSettingState>;
  name: string;
  current: number | null;
  label: string;
  hint: string;
  submitLabel: string;
  testId: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL);
  const [value, setValue] = useState(current !== null ? String(current) : "");

  return (
    <form action={formAction} className="space-y-2">
      <label className={LABEL} htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="number"
        min={0}
        className={FIELD}
        data-testid={`${testId}-input`}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <p className={HINT}>{hint}</p>
      <Submit label={submitLabel} testId={`${testId}-submit`} />
      <Result state={state} testId={`${testId}-saved`} />
    </form>
  );
}

function PlayerOfMonthForm({
  players,
  current,
}: {
  players: { id: string; nickname: string }[];
  current: string | null;
}) {
  const [state, formAction] = useActionState(setPlayerOfMonthAction, INITIAL);
  const [value, setValue] = useState(
    players.find((p) => p.nickname === current)?.id ?? "",
  );

  return (
    <form action={formAction} className="space-y-2">
      <label className={LABEL} htmlFor="playerId">
        {strings.admin.sitePotmLabel}
      </label>
      <select
        id="playerId"
        name="playerId"
        className={FIELD}
        data-testid="potm-select"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      >
        {/* The empty option CLEARS the pick, which is a real thing an admin
            does between months rather than an absence of choice. */}
        <option value="">{strings.admin.sitePotmNone}</option>
        {players.map((player) => (
          <option key={player.id} value={player.id}>
            {player.nickname}
          </option>
        ))}
      </select>
      <p className={HINT}>{strings.admin.sitePotmHint}</p>
      <Submit label={strings.admin.sitePotmSubmit} testId="potm-submit" />
      <Result state={state} testId="potm-saved" />
    </form>
  );
}

function Submit({ label, testId }: { label: string; testId: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid={testId}
      className="rounded-control bg-volt px-5 py-3 text-[15px] font-extrabold uppercase tracking-wide text-surface disabled:opacity-60"
    >
      {pending ? strings.common.loading : label}
    </button>
  );
}

function Result({ state, testId }: { state: SiteSettingState; testId: string }) {
  if (state.status === "saved") {
    return (
      <p data-testid={testId} className="text-[13px] text-volt">
        {strings.admin.saved}
      </p>
    );
  }
  if (state.status === "error" && state.message) {
    return (
      <p role="alert" className="text-[13px] text-muted">
        {state.message}
      </p>
    );
  }
  return null;
}
