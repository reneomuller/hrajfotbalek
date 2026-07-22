"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { setPlayerAdminAction, type AdminRightsState } from "@/app/admin/players/actions";
import { strings } from "@/lib/strings";

const INITIAL: AdminRightsState = { status: "idle" };

/**
 * Grant or revoke another player's admin rights.
 *
 * THE CONFIRM IS NOT DECORATION. This is the only control in the panel that
 * hands someone else every other control in the panel, and it sits in a row of
 * otherwise reversible buttons. `confirm()` is a blunt instrument, but the
 * failure it prevents — a mis-tap on a list of similar-looking rows — is
 * exactly the failure a blunt instrument is good at preventing.
 *
 * NOTHING HERE IS AUTHORIZATION. The caller's own row renders no button at all
 * (see the page), but that is ergonomics: `set_player_admin` refuses a
 * self-change on its own, against `auth.uid()`, and would refuse it just the
 * same if this component were bypassed entirely.
 */
export function AdminRightsButton({
  playerId,
  isAdmin,
}: {
  playerId: string;
  isAdmin: boolean;
}) {
  const [state, formAction] = useActionState(setPlayerAdminAction, INITIAL);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        const message = isAdmin
          ? strings.admin.adminConfirmRevoke
          : strings.admin.adminConfirmGrant;
        if (!window.confirm(message)) event.preventDefault();
      }}
      className="flex items-center gap-3"
    >
      <input type="hidden" name="playerId" value={playerId} />
      {/* The flag being MOVED TO, not the one held now: the server decides
          nothing from the current row, so a stale page cannot flip the wrong
          way. */}
      <input type="hidden" name="isAdmin" value={isAdmin ? "false" : "true"} />

      <SubmitButton isAdmin={isAdmin} />

      {state.status === "error" && state.message && (
        <span role="alert" className="font-mono text-[10px] tracking-[1px] text-muted">
          {state.message}
        </span>
      )}
    </form>
  );
}

function SubmitButton({ isAdmin }: { isAdmin: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      data-testid={isAdmin ? "revoke-admin" : "make-admin"}
      className={`bg-transparent font-mono text-[10px] uppercase tracking-eyebrow disabled:opacity-50 ${
        isAdmin ? "text-muted hover:text-white" : "text-volt"
      }`}
    >
      {pending
        ? strings.common.loading
        : isAdmin
          ? strings.admin.revokeAdmin
          : strings.admin.makeAdmin}
    </button>
  );
}
