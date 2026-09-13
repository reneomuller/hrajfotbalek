"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { setDisplayNameAction, type PlayerAdminState } from "@/app/admin/players/[id]/actions";
import { strings } from "@/lib/strings";

const INITIAL: PlayerAdminState = { status: "idle" };

/**
 * Admin rename of a player (round 33, item 1).
 *
 * IT IS ALWAYS VISIBLE, AND THAT IS THE REQUIREMENT RATHER THAN A PREFERENCE.
 * Its two neighbours — Remove photo and Remove banner — render only when there
 * is an image to remove, which is right: an enabled button for an absent photo
 * is a promise the page cannot keep. A NAME ALWAYS EXISTS. So the same
 * conditional applied here would hide the control for no reason a reader could
 * work out, which is the shape of the complaint that produced this item.
 *
 * DISCLOSURE, NOT AN ALWAYS-OPEN FIELD. The panel's other controls are buttons
 * and this one needs a text input; leaving it open would put a focusable,
 * pre-filled field between two destructive buttons on a page that is scrolled
 * fast. The trigger is always there, the field appears when it is asked for.
 *
 * THE CONFIRM MATCHES ITS NEIGHBOURS because the act is comparable: a rename is
 * visible to everyone the player has ever played with, and there is no undo
 * except typing the old name back — which only works while somebody still
 * remembers it. The event log keeps both names for exactly that reason.
 *
 * THE FIELD RE-SEEDS FROM THE SERVER'S ANSWER. `revalidatePath` re-renders the
 * page under this component, so a success marker held in client state can be
 * unmounted before it is read (CLAUDE.md, round 12). `state.name` is what the
 * RPC actually stored, so the input agrees with the page either way.
 */
export function ChangeNameForm({ playerId, name }: { playerId: string; name: string }) {
  const [state, formAction] = useActionState(setDisplayNameAction, INITIAL);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="change-name"
          className="rounded-control border border-hairline-strong px-3 py-2 text-[10px] uppercase tracking-eyebrow text-muted"
        >
          {strings.admin.nameChangeOpen}
        </button>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      data-testid="change-name-form"
      /*
       * THE FORM DOES NOT CLOSE ON SUBMIT, AND THE FIRST VERSION DID.
       *
       * Closing here unmounts the form before the action answers — so a refused
       * rename (a name somebody else holds, a character the format forbids)
       * collapsed the control and showed NOTHING, and the admin was left
       * looking at the old name with no idea why. Caught by
       * `round33.spec.ts`'s NICKNAME_TAKEN case, which could not find the error
       * element because it was never mounted.
       *
       * It stays open instead. On success the heading above re-renders with the
       * new name, which is the observable the spec asserts on and the thing a
       * person actually looks at; on failure the message is right where the
       * field is.
       */
      onSubmit={(event) => {
        if (!window.confirm(strings.admin.nameChangeConfirm)) event.preventDefault();
      }}
      className="min-w-[220px]"
    >
      <input type="hidden" name="playerId" value={playerId} />
      <label className="block" htmlFor={`nickname-${playerId}`}>
        <span className="field-label block">{strings.admin.nameChangeLabel}</span>
        <input
          id={`nickname-${playerId}`}
          name="nickname"
          type="text"
          defaultValue={state.name ?? name}
          maxLength={20}
          autoComplete="off"
          data-testid="change-name-input"
          className="field mt-2 w-full"
        />
      </label>
      <p className="mt-2 text-[11px] leading-snug text-faint">{strings.admin.nameChangeHint}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Submit />
        <button
          type="button"
          onClick={() => setOpen(false)}
          data-testid="change-name-cancel"
          className="rounded-control border border-hairline-strong px-3 py-2 text-[10px] uppercase tracking-eyebrow text-muted"
        >
          {strings.admin.nameChangeCancel}
        </button>
      </div>

      {state.status === "done" && (
        <p
          data-testid="name-changed"
          className="mt-2 text-[11px] uppercase tracking-eyebrow text-volt-dim"
        >
          {strings.admin.nameChanged}
        </p>
      )}
      {state.status === "error" && state.message && (
        <p role="alert" data-testid="change-name-error" className="mt-2 text-[12px] text-muted">
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
      data-testid="change-name-save"
      className="rounded-control bg-volt px-4 py-2 text-[10px] font-bold uppercase tracking-eyebrow text-ink disabled:opacity-50"
    >
      {pending ? strings.common.loading : strings.admin.nameChangeSave}
    </button>
  );
}
