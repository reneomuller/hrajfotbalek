"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { deletePlayerAction, type PlayerAdminState } from "@/app/admin/players/[id]/actions";
import { strings } from "@/lib/strings";

const INITIAL: PlayerAdminState = { status: "idle" };

/**
 * Delete an account (round 40), beside Ban — the same shape and the same
 * browser confirm, because it is the same kind of act: irreversible, and the
 * confirm says exactly what goes and what stays.
 */
export function DeletePlayerButton({ playerId }: { playerId: string }) {
  const [state, formAction] = useActionState(deletePlayerAction, INITIAL);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(strings.admin.deleteConfirm)) event.preventDefault();
      }}
      className="flex flex-wrap items-center gap-3"
    >
      <input type="hidden" name="playerId" value={playerId} />
      <Submit />
      {state.status === "error" && state.message && (
        <p role="alert" data-testid="delete-player-error" className="m-0 text-[12px] text-muted">
          {state.message}
        </p>
      )}
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid="delete-player"
      className="rounded-control border border-danger/60 px-3 py-2 text-[10px] uppercase tracking-eyebrow text-danger disabled:opacity-50"
    >
      {pending ? strings.common.loading : strings.admin.deletePlayer}
    </button>
  );
}
