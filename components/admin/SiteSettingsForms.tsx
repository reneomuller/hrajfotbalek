"use client";

import { useActionState, useState } from "react";
import {
  setActivePlayersAction,
  setGamesPerWeekAction,
  setPlayerOfMonthAction,
  type SiteSettingState,
} from "@/app/admin/site/actions";
import { PendingButton } from "@/components/form/PendingButton";
import { strings } from "@/lib/strings";

const INITIAL: SiteSettingState = { status: "idle" };

const HINT = "mt-2 text-[12px] leading-snug text-muted";

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
 * LAID OUT AS THE HOME PAGE READS THEM (round 42): the two numbers side by
 * side, as they sit in the landing page's stats panel, and the pick beneath.
 * The page around this puts it in a panel; this only says what is inside.
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
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <NumberForm
          action={setGamesPerWeekAction}
          name="gamesPerWeek"
          current={gamesPerWeek}
          label={strings.admin.siteGamesPerWeekLabel}
          submitLabel={strings.admin.siteGamesPerWeekSubmit}
          testId="games-per-week"
        />
        <NumberForm
          action={setActivePlayersAction}
          name="activePlayers"
          current={activePlayers}
          label={strings.admin.siteActivePlayersLabel}
          submitLabel={strings.admin.siteActivePlayersSubmit}
          testId="active-players"
        />
      </div>
      <div className="border-t border-hairline pt-5">
        <PlayerOfMonthForm players={players} current={currentPlayerOfMonth} />
      </div>
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
  submitLabel,
  testId,
}: {
  action: (state: SiteSettingState, formData: FormData) => Promise<SiteSettingState>;
  name: string;
  current: number | null;
  label: string;
  submitLabel: string;
  testId: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL);
  const [value, setValue] = useState(current !== null ? String(current) : "");

  return (
    <form action={formAction} className="min-w-0">
      <label className="field-label" htmlFor={name}>
        {label}
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id={name}
          name={name}
          type="number"
          inputMode="numeric"
          min={0}
          className="field w-0 min-w-0 flex-1 font-display text-[22px] leading-none tabular-nums text-volt"
          data-testid={`${testId}-input`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <PendingButton label={submitLabel} testId={`${testId}-submit`} className="shrink-0" />
      </div>
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
    <form action={formAction}>
      <label className="field-label" htmlFor="playerId">
        {strings.admin.sitePotmLabel}
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <select
          id="playerId"
          name="playerId"
          className="field min-w-0 flex-1"
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
        <PendingButton label={strings.admin.sitePotmSubmit} testId="potm-submit" className="shrink-0" />
      </div>
      <p className={HINT}>{strings.admin.sitePotmHint}</p>
      <Result state={state} testId="potm-saved" />
    </form>
  );
}

function Result({ state, testId }: { state: SiteSettingState; testId: string }) {
  if (state.status === "saved") {
    return (
      <p data-testid={testId} className="m-0 mt-2 text-small text-volt">
        {strings.admin.saved}
      </p>
    );
  }
  if (state.status === "error" && state.message) {
    return (
      <p role="alert" className="m-0 mt-2 text-small text-warn">
        {state.message}
      </p>
    );
  }
  return null;
}
