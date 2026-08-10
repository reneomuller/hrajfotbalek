"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFormStatus } from "react-dom";
import { cancelBookingAction, type CancelActionState } from "@/app/account/actions";
import { FormError } from "@/components/form/FormError";
import { useStrings } from "@/components/LocaleProvider";

const INITIAL: CancelActionState = { status: "idle" };


/**
 * Self-cancel control.
 *
 * The confirmation prompt is deliberate: cancelling returns value as wallet
 * credit rather than money, so it is not a fully reversible action from the
 * player's point of view and should not be one tap away by accident.
 */
export function CancelBookingForm({
  bookingId,
  toastTo,
  variant = "default",
}: {
  bookingId: string;
  /**
   * Where to land afterwards, so the cancellation toast is rendered by the
   * SERVER on the next request rather than from this component's action state
   * — which `revalidatePath` can unmount before anyone sees it (CLAUDE.md).
   */
  toastTo?: string;
  /** `bar` is the §2.4 claim bar's holding states — a text button, no note. */
  variant?: "default" | "bar";
}) {
  const t = useStrings();
  const [state, formAction] = useActionState(cancelBookingAction, INITIAL);
  const [open, setOpen] = useState(false);

  const trigger = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  /*
   * FOCUS INTO THE DIALOG AND BACK OUT AGAIN. Without it, opening leaves focus
   * on a trigger that is now behind a modal and closing throws the keyboard to
   * the top of the document — the two halves of the same failure, and the one
   * a disclosure pattern is most often audited for.
   */
  useEffect(() => {
    if (open && !wasOpen.current) confirmButton.current?.focus();
    if (!open && wasOpen.current) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);

  /*
   * A FAILURE KEEPS THE DIALOG OPEN, which is §3 screen 5's requirement: the
   * error belongs INSIDE the dialog, beside the control that produced it.
   * Success never lands here at all — the action redirects to `toastTo` and
   * the server renders the outcome, because a success marker written by a
   * client action is unmounted by `revalidatePath` before it can be read.
   */
  const failed = state.status === "error";

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        data-testid="cancel-booking"
        className={
          variant === "bar"
            ? "flex min-h-11 items-center justify-center px-3 text-body-lg text-muted transition-colors hover:text-bone"
            : "min-h-11 rounded-control border border-hairline-strong px-4 text-body text-muted transition-colors hover:border-hairline-volt"
        }
      >
        {variant === "bar" ? t.booking.barCancel : t.booking.cancelBooking}
      </button>

      {open && typeof document !== "undefined" &&
        /*
          PORTALLED TO `document.body`, and this is not tidiness — it is the
          only thing that makes the dialog clickable.

          Guarded on `document` rather than on a mounted flag: the dialog only
          ever opens from a click, so it cannot render during SSR or during
          hydration, and a `useState`/`useEffect` pair to prove that would be
          state set in an effect for no gain.

          `z-50` is not an absolute rank; it is a rank WITHIN a stacking
          context. This form renders inside `<main className="relative z-10">`,
          so the whole dialog was confined to that context and the nav pill —
          `fixed z-40` at the document root — painted over it. The confirm
          button was visible, enabled and unreachable: `elementFromPoint` at
          its centre returned a nav-pill list item, and Playwright waited for
          an element that would never become clickable.

          A portal moves it out to the body, where its `z-50` finally competes
          with the pill and the claim bar on equal terms.
        */
        createPortal(
        /*
          A REAL DIALOG, replacing `window.confirm`. That box cannot be styled,
          cannot state what the refund actually is, reads on a phone as the
          page having been hijacked, and — the reason it had to go — has
          nowhere to put a failure.

          `aria-modal` with a labelled heading; the backdrop closes it, which
          is the gesture people try first, and Escape does the same.
        */
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-dialog-title"
          data-testid="cancel-dialog"
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/80 p-4 md:items-center"
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
        >
          <button
            type="button"
            aria-label={t.common.dismiss}
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default"
          />

          <div className="relative w-full max-w-[480px] rounded-card bg-surface p-5">
            <h2
              id="cancel-dialog-title"
              className="m-0 text-body-lg font-semibold text-bone"
            >
              {t.booking.cancelTitle}
            </h2>

            {/*
              RULING O, CREDIT HALF ONLY. What comes back is wallet credit and
              never money — there is no cash-refund path in this system, and
              "refund" would promise the quarantined half.
            */}
            <p className="mt-2 mb-0 text-body leading-relaxed text-muted">
              {t.booking.refundToWallet}
            </p>

            {failed && (
              <div className="mt-4">
                <FormError
                  message={t.booking.cancelFailed}
                  code={state.code ?? undefined}
                />
              </div>
            )}

            <form action={formAction} className="mt-5 flex flex-wrap items-center gap-3">
              <input type="hidden" name="bookingId" value={bookingId} />
              {toastTo && <input type="hidden" name="toastTo" value={toastTo} />}
              <ConfirmButton innerRef={confirmButton} />
              <button
                type="button"
                data-testid="cancel-dialog-keep"
                onClick={() => setOpen(false)}
                className="min-h-11 px-3 text-body text-muted transition-colors hover:text-bone"
              >
                {t.booking.cancelKeep}
              </button>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * The destructive confirm, as a SECONDARY button rather than a volt one.
 *
 * Cancelling is not the action this product is encouraging, and a filled volt
 * control is how the product says "do this". The dialog's primary is `Keep my
 * spot`, which is the quiet text button beside it precisely because the
 * decision has already been made by the time someone is reading this.
 */
function ConfirmButton({ innerRef }: { innerRef: React.RefObject<HTMLButtonElement | null> }) {
  const t = useStrings();
  const { pending } = useFormStatus();
  return (
    <button
      ref={innerRef}
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      data-testid="cancel-dialog-confirm"
      data-pending={pending ? "true" : "false"}
      className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-control border border-danger px-5 text-body-lg font-bold text-danger transition-colors hover:bg-danger/10 ${
        pending ? "pointer-events-none opacity-70" : ""
      }`}
    >
      {pending && (
        <span
          aria-hidden
          className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
        />
      )}
      {t.booking.cancelBooking}
    </button>
  );
}
