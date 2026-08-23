"use client";

import { useActionState, useState } from "react";
import { createPortal } from "react-dom";
import { useFormStatus } from "react-dom";
import type { DeleteState } from "@/app/admin/games/[id]/actions";
import { strings } from "@/lib/strings";

const INITIAL: DeleteState = { status: "idle" };

/**
 * A destructive control behind a dialog (round 16, item 18).
 *
 * ONE COMPONENT FOR GAMES AND VENUES, because the shape is identical — a quiet
 * trigger, a dialog that names the consequence, a confirm — and the only
 * differences are the words and which action runs. Two copies would be two
 * places for the dialog to stop being portalled.
 *
 * PORTALLED. CLAUDE.md's modal law: `z-50` is a rank WITHIN a stacking
 * context, and the admin shell is `relative z-10`, so a dialog rendered inside
 * it is capped below the nav pill at `z-40` — visible, enabled, and
 * permanently unreachable. `createPortal` into `document.body` is what lets
 * its z-index compete on equal terms.
 *
 * THE REFUSAL IS NOT HERE. A game with bookings and a venue with games are
 * refused in SQL; this renders whatever the RPC says, which is a sentence
 * naming the next step rather than a failure. Hiding the button when the
 * delete would be refused would be a third place that has to know the rule.
 */
export function DeleteControl({
  action,
  hiddenFields,
  label,
  title,
  body,
  confirmLabel,
  testId,
}: {
  action: (state: DeleteState, formData: FormData) => Promise<DeleteState>;
  hiddenFields: Record<string, string>;
  label: string;
  title: string;
  body: string;
  confirmLabel: string;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, INITIAL);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid={testId}
        className="rounded-control border border-hairline px-3 py-2 text-[11px] uppercase tracking-eyebrow text-muted transition-colors hover:border-hairline-strong hover:text-bone"
      >
        {label}
      </button>

      {/*
        THE REFUSAL RENDERS BESIDE THE TRIGGER, not inside the dialog — the
        dialog closes on submit, and a message shown only there would vanish
        with it. This is the one thing an admin needs to still be able to read
        afterwards.
      */}
      {state.status === "error" && state.message && (
        <p role="alert" data-testid={`${testId}-error`} className="mt-2 text-[12px] text-bone">
          {state.message}
        </p>
      )}

      {open &&
        createPortal(
          <>
            <button
              type="button"
              aria-label={strings.common.close}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[60] cursor-default bg-ink/70"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={title}
              data-testid={`${testId}-dialog`}
              className="lifted fixed left-1/2 top-1/2 z-[61] w-[min(360px,calc(100vw-2*22px))] -translate-x-1/2 -translate-y-1/2 rounded-card p-5 shadow-lift"
            >
              <h2 className="m-0 text-[17px] font-bold uppercase tracking-wide text-white">
                {title}
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-bone">{body}</p>

              <form
                action={formAction}
                onSubmit={() => setOpen(false)}
                className="mt-5 flex flex-wrap gap-3"
              >
                {Object.entries(hiddenFields).map(([name, value]) => (
                  <input key={name} type="hidden" name={name} value={value} />
                ))}
                <ConfirmButton label={confirmLabel} testId={`${testId}-confirm`} />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-control border border-hairline-strong px-4 py-2 text-[13px] text-bone"
                >
                  {strings.common.close}
                </button>
              </form>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

function ConfirmButton({ label, testId }: { label: string; testId: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid={testId}
      className="rounded-control bg-volt px-4 py-2 text-[13px] font-bold text-ink disabled:opacity-60"
    >
      {pending ? strings.common.loading : label}
    </button>
  );
}
