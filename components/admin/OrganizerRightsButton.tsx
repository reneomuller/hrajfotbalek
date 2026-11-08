"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  setPlayerOrganizerAction,
  type OrganizerRightsState,
} from "@/app/admin/players/actions";
import { strings } from "@/lib/strings";
import { chipQuiet, chipVolt } from "@/components/admin/players/controlStyles";

const INITIAL: OrganizerRightsState = { status: "idle" };

/**
 * "Make organizer", beside "Make admin" (round 42, the owner: "in the player
 * admin view, i would like for there to be 'make organizer' next to the option
 * of making the user admin"). An organizer is who the game form's dropdown
 * offers, and whose photo the game page shows.
 *
 * NO CONFIRM, unlike admin rights: this grants no power over anything, and the
 * other press undoes it. The label states the flag the press moves TO, from the
 * server's own answer once it has one.
 */
export function OrganizerRightsButton({
  playerId,
  isOrganizer,
}: {
  playerId: string;
  isOrganizer: boolean;
}) {
  const [state, formAction] = useActionState(setPlayerOrganizerAction, INITIAL);
  const current = state.status === "changed" ? (state.isOrganizer ?? isOrganizer) : isOrganizer;

  return (
    <form action={formAction} className="flex items-center gap-3">
      <input type="hidden" name="playerId" value={playerId} />
      <input type="hidden" name="isOrganizer" value={current ? "false" : "true"} />

      <SubmitButton isOrganizer={current} />

      {state.status === "error" && state.message && (
        <span role="alert" className="text-[12px] text-muted">
          {state.message}
        </span>
      )}
    </form>
  );
}

function SubmitButton({ isOrganizer }: { isOrganizer: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      data-testid={isOrganizer ? "revoke-organizer" : "make-organizer"}
      className={isOrganizer ? chipQuiet : chipVolt}
    >
      {pending
        ? strings.common.loading
        : isOrganizer
          ? strings.admin.revokeOrganizer
          : strings.admin.makeOrganizer}
    </button>
  );
}
