"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { setPlayerBannedAction, type PlayerAdminState } from "@/app/admin/players/[id]/actions";
import { strings } from "@/lib/strings";

const INITIAL: PlayerAdminState = { status: "idle" };

/**
 * Ban or unban a player (round 35 v2, item 8).
 *
 * A TOGGLE, LIKE MAKE/REMOVE ADMIN, and it sits beside it because they are the
 * same KIND of act: the two controls that change what an account IS rather than
 * what it looks like. Remove photo and Remove banner are one row down, where
 * the acts about appearance live.
 *
 * DESTRUCTIVE STYLING, AND IT IS THE ONLY CONTROL IN THE PANEL THAT HAS IT.
 * Everything else here is reversible or small; this one cancels other people's
 * plans — the seats go, the waitlist is notified, and somebody else takes them.
 * Unbanning does not put any of that back, which the confirm says in words.
 *
 * THE DIRECTION TRAVELS IN THE FORM, not read off this row by the server. Same
 * shape as `AdminRightsButton`: a stale page describing the state it happens to
 * be showing must not be able to flip the wrong way.
 *
 * IT DOES NOT CLOSE ITSELF and there is nothing to close — round 33's lesson
 * applies to the forms that do: the server's next render is what changes the
 * label, because `revalidatePath` re-reads `banned_at`.
 */
export function BanPlayerButton({
  playerId,
  isBanned,
}: {
  playerId: string;
  isBanned: boolean;
}) {
  const [state, formAction] = useActionState(setPlayerBannedAction, INITIAL);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        const message = isBanned ? strings.admin.unbanConfirm : strings.admin.banConfirm;
        if (!window.confirm(message)) event.preventDefault();
      }}
      className="flex flex-wrap items-center gap-3"
    >
      <input type="hidden" name="playerId" value={playerId} />
      {/* The state being MOVED TO, never the one held now. */}
      <input type="hidden" name="banned" value={isBanned ? "false" : "true"} />

      <Submit isBanned={isBanned} />

      {state.status === "error" && state.message && (
        <p role="alert" data-testid="ban-error" className="m-0 text-[12px] text-muted">
          {state.message}
        </p>
      )}
    </form>
  );
}

function Submit({ isBanned }: { isBanned: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid={isBanned ? "unban-player" : "ban-player"}
      className={[
        "rounded-control px-3 py-2 text-[10px] uppercase tracking-eyebrow disabled:opacity-50",
        isBanned
          ? "border border-hairline-strong text-muted"
          : "border border-danger/60 text-danger",
      ].join(" ")}
    >
      {pending
        ? strings.common.loading
        : isBanned
          ? strings.admin.unbanPlayer
          : strings.admin.banPlayer}
    </button>
  );
}
