"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { deleteOwnAccountAction, type DeleteAccountState } from "@/app/account/actions";
import { useStrings } from "@/components/LocaleProvider";

const INITIAL: DeleteAccountState = { status: "idle" };

/**
 * "Delete my account", self-service (round 40, Obchodní podmínky 4.7). The
 * browser confirm names what goes, because nothing can bring it back.
 */
export function DeleteAccountButton() {
  const t = useStrings();
  const [state, formAction] = useActionState(deleteOwnAccountAction, INITIAL);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(t.account.deleteAccountConfirm)) event.preventDefault();
      }}
    >
      <Submit label={t.account.deleteAccount} />
      {state.status === "error" && state.message && (
        <p role="alert" data-testid="delete-account-error" className="m-0 text-[12px] text-danger">
          {state.message}
        </p>
      )}
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid="delete-account"
      className="block bg-transparent p-0 py-2 text-left text-[12px] text-muted transition hover:text-danger disabled:opacity-50"
    >
      {label}
    </button>
  );
}
