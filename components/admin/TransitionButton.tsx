"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { AdminActionState } from "@/app/admin/games/actions";
import { strings } from "@/lib/strings";

const INITIAL: AdminActionState = { status: "idle" };

/**
 * A one-field form posting a game id to a transition action.
 *
 * Deliberately dumb: it holds no opinion about which transitions are legal.
 * The caller decides whether to render it, `availableTransitions()` decides
 * what the caller offers, and the RPC refuses anything illegal regardless of
 * what either of them thought.
 */
export function TransitionButton({
  action,
  gameId,
  label,
  testId,
  tone = "primary",
}: {
  action: (state: AdminActionState, formData: FormData) => Promise<AdminActionState>;
  gameId: string;
  label: string;
  testId?: string;
  tone?: "primary" | "secondary";
}) {
  const [state, formAction] = useActionState(action, INITIAL);

  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="gameId" value={gameId} />
      <Submit label={label} testId={testId} tone={tone} />
      {state.status === "error" && state.message && (
        <p role="alert" className="mt-2 text-[12px] text-muted">
          {state.message}
        </p>
      )}
    </form>
  );
}

function Submit({
  label,
  testId,
  tone,
}: {
  label: string;
  testId?: string;
  tone: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();
  const base =
    "rounded-cta px-5 py-3 font-condensed text-[15px] font-extrabold uppercase tracking-wide disabled:opacity-60";
  const skin =
    tone === "primary"
      ? "bg-volt text-surface"
      : "border border-hairline-strong bg-transparent text-bone";

  return (
    <button type="submit" disabled={pending} data-testid={testId} className={`${base} ${skin}`}>
      {pending ? strings.common.loading : label}
    </button>
  );
}
