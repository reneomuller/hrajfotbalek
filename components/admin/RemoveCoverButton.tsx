"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { removeCoverAction, type PlayerAdminState } from "@/app/admin/players/[id]/actions";
import { strings } from "@/lib/strings";

const INITIAL: PlayerAdminState = { status: "idle" };

/**
 * Admin banner removal (round 30, item 2) — `RemovePhotoButton`'s twin.
 *
 * SAME CONFIRM TREATMENT, and that is a requirement rather than symmetry for
 * its own sake. This deletes someone else's uploaded image with no undo — the
 * object leaves storage, it is not merely unlinked — so it is not one tap away
 * by accident. The avatar's removal has been guarded that way since Phase 7
 * and the two now sit side by side, where a difference between them would read
 * as one of them being safer than it is.
 *
 * DELIBERATELY A SEPARATE COMPONENT rather than a `target` prop on the other
 * one. Two buttons that call two different RPCs against two different columns
 * are two components; parameterising over "which image" would put a conditional
 * inside the one place a mis-wire deletes the wrong picture.
 */
export function RemoveCoverButton({ playerId }: { playerId: string }) {
  const [state, formAction] = useActionState(removeCoverAction, INITIAL);

  if (state.status === "done") {
    return (
      <p
        data-testid="cover-removed"
        className="m-0 text-[11px] uppercase tracking-eyebrow text-volt-dim"
      >
        {strings.admin.coverRemoved}
      </p>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(strings.admin.coverRemoveConfirm)) event.preventDefault();
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
      data-testid="remove-cover"
      className="rounded-control border border-hairline-strong px-3 py-2 text-[10px] uppercase tracking-eyebrow text-muted disabled:opacity-50"
    >
      {pending ? strings.common.loading : strings.admin.coverRemove}
    </button>
  );
}
