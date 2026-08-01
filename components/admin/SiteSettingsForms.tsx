"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  setActivePlayersAction,
  setPlayerOfMonthAction,
  type SiteSettingState,
} from "@/app/admin/site/actions";
import { strings } from "@/lib/strings";

const INITIAL: SiteSettingState = { status: "idle" };

const FIELD =
  "mt-1 w-full rounded-control border border-hairline-strong bg-surface px-3 py-2 font-mono text-[13px] text-bone";
const LABEL = "block font-mono text-[10px] uppercase tracking-eyebrow text-muted";
const HINT = "mt-1 text-[12px] leading-snug text-muted-dim";

/**
 * The two site-setting forms.
 *
 * TWO FORMS, TWO ACTIONS, rather than one form saving both. They are edited on
 * completely different cadences — the community number moves a few times a
 * year, the Player of the Month once a month — and one combined save would
 * mean re-submitting a number nobody was looking at, which is how a value gets
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
  players,
  currentPlayerOfMonth,
}: {
  activePlayers: number | null;
  players: { id: string; nickname: string }[];
  currentPlayerOfMonth: string | null;
}) {
  return (
    <div className="mt-6 max-w-[560px] space-y-8">
      <ActivePlayersForm activePlayers={activePlayers} />
      <PlayerOfMonthForm players={players} current={currentPlayerOfMonth} />
    </div>
  );
}

function ActivePlayersForm({ activePlayers }: { activePlayers: number | null }) {
  const [state, formAction] = useActionState(setActivePlayersAction, INITIAL);
  const [value, setValue] = useState(activePlayers !== null ? String(activePlayers) : "");

  return (
    <form action={formAction} className="space-y-2">
      <label className={LABEL} htmlFor="activePlayers">
        {strings.admin.siteActivePlayersLabel}
      </label>
      <input
        id="activePlayers"
        name="activePlayers"
        type="number"
        min={0}
        className={FIELD}
        data-testid="active-players-input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <p className={HINT}>{strings.admin.siteActivePlayersHint}</p>
      <Submit label={strings.admin.siteActivePlayersSubmit} testId="active-players-submit" />
      <Result state={state} testId="active-players-saved" />
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
      className="rounded-cta bg-volt px-5 py-3 font-condensed text-[15px] font-extrabold uppercase tracking-wide text-surface disabled:opacity-60"
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
