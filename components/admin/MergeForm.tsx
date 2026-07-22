"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { mergePlayersAction, type MergeState } from "@/app/admin/players/merge/actions";
import type { AdminPlayerRow } from "@/lib/admin/queries";
import { formatCzk } from "@/lib/format";
import { strings } from "@/lib/strings";

const INITIAL: MergeState = { status: "idle" };

/**
 * Pick a shadow, pick the account to keep, see both identities, then merge.
 *
 * The pre-merge summary is not decoration: this is irreversible, it moves
 * money, and the confirmation an admin actually needs is "these two rows are
 * the same person" — which they can only check against booking counts and
 * balances. The shadow list is restricted to rows with no auth user, because
 * merging away a player who has signed in would orphan their auth user, and
 * the RPC refuses it anyway.
 */
export function MergeForm({ players }: { players: AdminPlayerRow[] }) {
  const [state, formAction] = useActionState(mergePlayersAction, INITIAL);
  const [shadowId, setShadowId] = useState("");
  const [survivingId, setSurvivingId] = useState("");

  const shadows = players.filter((player) => player.isShadow);
  const shadow = players.find((player) => player.id === shadowId) ?? null;
  const surviving = players.find((player) => player.id === survivingId) ?? null;

  if (state.status === "merged") {
    return (
      <div
        data-testid="merge-done"
        className="mt-6 rounded-card border border-hairline-volt bg-surface-card p-5"
      >
        <p className="m-0 font-condensed text-[17px] font-bold uppercase tracking-wide text-volt">
          {strings.admin.mergeDone}
        </p>
        <p className="mt-2 font-mono text-[12px] text-muted">
          {strings.admin.mergeRowsMoved}: {state.rowsMoved}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 max-w-[560px] space-y-5">
      <div>
        <label className="block font-mono text-[10px] uppercase tracking-eyebrow text-muted">
          {strings.admin.mergeShadowLabel}
        </label>
        <select
          name="shadowId"
          value={shadowId}
          onChange={(event) => setShadowId(event.target.value)}
          data-testid="merge-shadow"
          className="mt-1 w-full rounded-control border border-hairline-strong bg-surface px-3 py-2 font-mono text-[13px] text-bone"
        >
          <option value="">—</option>
          {shadows.map((player) => (
            <option key={player.id} value={player.id}>
              {player.nickname} · {player.email ?? strings.admin.noEmail}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block font-mono text-[10px] uppercase tracking-eyebrow text-muted">
          {strings.admin.mergeSurvivingLabel}
        </label>
        <select
          name="survivingId"
          value={survivingId}
          onChange={(event) => setSurvivingId(event.target.value)}
          data-testid="merge-surviving"
          className="mt-1 w-full rounded-control border border-hairline-strong bg-surface px-3 py-2 font-mono text-[13px] text-bone"
        >
          <option value="">—</option>
          {players
            .filter((player) => player.id !== shadowId)
            .map((player) => (
              <option key={player.id} value={player.id}>
                {player.nickname} · {player.email ?? strings.admin.noEmail}
              </option>
            ))}
        </select>
      </div>

      {(shadow || surviving) && (
        <dl
          data-testid="merge-preview"
          className="grid grid-cols-[auto_1fr_1fr] gap-x-6 gap-y-1 rounded-card border border-hairline p-4 font-mono text-[12px]"
        >
          <dt className="text-muted" />
          <dd className="m-0 text-bone">{shadow?.nickname ?? "—"}</dd>
          <dd className="m-0 text-bone">{surviving?.nickname ?? "—"}</dd>

          <dt className="text-muted">{strings.admin.bookingsLabel}</dt>
          <dd className="m-0 text-bone">{shadow?.bookingCount ?? 0}</dd>
          <dd className="m-0 text-bone">{surviving?.bookingCount ?? 0}</dd>

          <dt className="text-muted">{strings.admin.balanceLabel}</dt>
          <dd className="m-0 text-volt">{formatCzk(shadow?.balanceCzk ?? 0)}</dd>
          <dd className="m-0 text-volt">{formatCzk(surviving?.balanceCzk ?? 0)}</dd>
        </dl>
      )}

      <SubmitButton disabled={!shadowId || !survivingId} />

      {state.status === "error" && state.message && (
        <p role="alert" data-testid="merge-error" className="text-[13px] text-muted">
          {state.message}
        </p>
      )}
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      data-testid="merge-submit"
      className="w-full rounded-cta bg-volt px-6 py-4 font-condensed text-cta font-extrabold uppercase tracking-wide text-surface disabled:opacity-60"
    >
      {pending ? strings.common.loading : strings.admin.mergeSubmit}
    </button>
  );
}
