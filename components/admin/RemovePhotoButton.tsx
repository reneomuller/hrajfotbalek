"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { removePhotoAction, type PlayerAdminState } from "@/app/admin/players/[id]/actions";
import { strings } from "@/lib/strings";

const INITIAL: PlayerAdminState = { status: "idle" };

/**
 * Admin photo removal (REQ-PROF-005), the surface Phase 7's RPC never got.
 *
 * CONFIRMED BEFORE IT FIRES. This deletes someone else's uploaded image and
 * there is no undo — the object is gone from storage, not merely unlinked —
 * so it is not one tap away by accident. Same reasoning as the self-cancel
 * prompt, which guards a smaller thing.
 */
export function RemovePhotoButton({ playerId }: { playerId: string }) {
  const [state, formAction] = useActionState(removePhotoAction, INITIAL);

  if (state.status === "done") {
    return (
      <p
        data-testid="photo-removed"
        className="m-0 font-mono text-[11px] uppercase tracking-eyebrow text-volt-dim"
      >
        {strings.admin.photoRemoved}
      </p>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(strings.admin.photoRemoveConfirm)) event.preventDefault();
      }}
    >
      <input type="hidden" name="playerId" value={playerId} />
      <Submit />
      {state.status === "error" && state.message && (
        <p role="alert" className="mt-2 text-[12px] text-muted">
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
      data-testid="remove-photo"
      className="rounded-control border border-hairline-strong px-3 py-2 font-mono text-[10px] uppercase tracking-eyebrow text-muted disabled:opacity-50"
    >
      {pending ? strings.common.loading : strings.admin.photoRemove}
    </button>
  );
}
