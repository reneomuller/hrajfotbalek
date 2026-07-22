"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { addPlayerAction, type AddPlayerState } from "@/app/admin/games/[id]/add-player/actions";
import { NICKNAME_MAX_LENGTH } from "@/lib/auth/nickname";
import { strings } from "@/lib/strings";

const INITIAL: AddPlayerState = { status: "idle" };

const FIELD =
  "mt-1 w-full rounded-control border border-hairline-strong bg-surface px-3 py-2 font-mono text-[13px] text-bone";
const LABEL = "block font-mono text-[10px] uppercase tracking-eyebrow text-muted";

/**
 * Add-player form — one screen, one submit, ≤10s end to end.
 *
 * Payment method offers `qr` and `cash` only. `credit` and `seed_free` are
 * outcomes the RPC derives from the player and their wallet, not choices an
 * admin gets to make, so they are not on this form at all rather than being
 * offered and then overridden.
 */
export function AddPlayerForm({ gameId }: { gameId: string }) {
  const [state, formAction] = useActionState(addPlayerAction, INITIAL);

  if (state.status === "added") {
    return (
      <div
        data-testid="add-player-done"
        className="mt-6 rounded-card border border-hairline-volt bg-surface-card p-5"
      >
        <p className="m-0 font-condensed text-[17px] font-bold uppercase tracking-wide text-volt">
          {strings.admin.addPlayerDone}
        </p>
        <Link
          href={`/admin/games/${gameId}`}
          className="mt-4 inline-block font-mono text-[11px] uppercase tracking-eyebrow text-muted no-underline"
        >
          {strings.common.back}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 max-w-[480px] space-y-5">
      <input type="hidden" name="gameId" value={gameId} />

      <div>
        <label className={LABEL} htmlFor="nickname">
          {strings.admin.addPlayerNickname}
        </label>
        <input
          id="nickname"
          name="nickname"
          required
          maxLength={NICKNAME_MAX_LENGTH}
          className={FIELD}
          data-testid="add-player-nickname"
        />
        <p className="mt-1 text-[12px] text-muted-dim">{strings.auth.nicknameHint}</p>
        {state.fieldErrors?.nickname && (
          <p className="mt-1 text-[12px] text-volt">{state.fieldErrors.nickname}</p>
        )}
      </div>

      <div>
        <label className={LABEL} htmlFor="email">
          {strings.admin.addPlayerEmail}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className={FIELD}
          data-testid="add-player-email"
        />
        <p className="mt-1 text-[12px] text-muted-dim">{strings.admin.addPlayerEmailHint}</p>
      </div>

      <fieldset className="border-0 p-0">
        <legend className={LABEL}>{strings.admin.addPlayerMethod}</legend>
        <div className="mt-2 flex gap-4">
          <label className="flex items-center gap-2 text-[13px] text-bone">
            <input type="radio" name="method" value="qr" defaultChecked />
            {strings.booking.payByQr}
          </label>
          <label className="flex items-center gap-2 text-[13px] text-bone">
            <input type="radio" name="method" value="cash" />
            {strings.booking.payByCash}
          </label>
        </div>
      </fieldset>

      <SubmitButton />

      {state.status === "duplicate" && (
        <div role="alert" data-testid="add-player-duplicate" className="text-[13px] text-bone">
          <p className="m-0">{strings.admin.addPlayerDuplicate}</p>
          <Link
            href="/admin/players/merge"
            className="mt-2 inline-block font-mono text-[11px] uppercase tracking-eyebrow text-volt no-underline"
          >
            {strings.admin.addPlayerGoToMerge}
          </Link>
        </div>
      )}

      {state.status === "error" && state.message && (
        <p role="alert" className="text-[13px] text-muted">
          {state.message}
        </p>
      )}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid="add-player-submit"
      className="w-full rounded-cta bg-volt px-6 py-4 font-condensed text-cta font-extrabold uppercase tracking-wide text-surface disabled:opacity-60"
    >
      {pending ? strings.common.loading : strings.admin.addPlayerSubmit}
    </button>
  );
}
