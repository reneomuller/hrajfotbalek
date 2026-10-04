"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { TransitionState } from "@/lib/admin/actionState";
import { strings } from "@/lib/strings";

const INITIAL: TransitionState = { status: "idle" };

/**
 * Archive or restore one venue (round 39, item 2).
 *
 * NO DIALOG, unlike delete: both directions are one press from being undone,
 * and the refusal — if the RPC has one — renders beside the button because the
 * row it sits in moves between the two lists on success.
 */
export function VenueArchiveButton({
  action,
  venueId,
  label,
  testId,
}: {
  action: (state: TransitionState, formData: FormData) => Promise<TransitionState>;
  venueId: string;
  label: string;
  testId: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL);

  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="venueId" value={venueId} />
      <Submit label={label} testId={testId} />
      {state.status === "error" && state.message && (
        <p role="alert" data-testid={`${testId}-error`} className="mt-2 text-[12px] text-bone">
          {state.message}
        </p>
      )}
    </form>
  );
}

function Submit({ label, testId }: { label: string; testId: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid={testId}
      className="rounded-control border border-hairline-strong px-3 py-2 text-[11px] uppercase tracking-eyebrow text-bone transition-colors hover:border-volt hover:text-volt disabled:opacity-60"
    >
      {pending ? strings.common.loading : label}
    </button>
  );
}
