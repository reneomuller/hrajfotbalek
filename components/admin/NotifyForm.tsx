"use client";

import { useActionState, useState } from "react";
import { publishNotificationAction, type NotifyState } from "@/app/notifications/actions";
import { strings } from "@/lib/strings";

const INITIAL: NotifyState = { status: "idle" };

/**
 * "Notify players" (round 7, item 5).
 *
 * TWO USES, ONE COMPONENT. On `/admin/site` it is an empty compose box. After
 * an admin action — publishing a game, adding a pitch — it renders with a
 * DRAFT already in the fields.
 *
 * THE DRAFT IS A DRAFT, WHICH IS THE WHOLE RULE. It is prefilled, editable,
 * and dismissible, and nothing sends until the owner presses the button. The
 * item is explicit: his content, his choice, never auto-sent. So there is no
 * code path anywhere that calls `publishNotificationAction` without a click —
 * publishing a game does not queue a message, it offers to write one.
 *
 * `dismissed` IS LOCAL AND UNPERSISTED. Dismissing hides the offer for this
 * render; navigating back to the page offers it again. Persisting "he said no
 * to this one" would need a per-admin-per-game row to record a non-event.
 */
export function NotifyForm({
  defaultTitle = "",
  defaultBody = "",
  /** An offer after an action, rather than the standing compose box. */
  asOffer = false,
}: {
  defaultTitle?: string;
  defaultBody?: string;
  asOffer?: boolean;
}) {
  const [state, formAction, pending] = useActionState(publishNotificationAction, INITIAL);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  // After a send the offer disappears; the standing box stays and says so.
  if (state.status === "sent" && asOffer) return null;

  return (
    <section
      data-testid={asOffer ? "notify-offer" : "notify-form"}
      className={`rounded-card p-5 ${asOffer ? "border-2 border-hairline-volt bg-surface-raised" : "lifted"}`}
    >
      <h3 className="m-0 text-eyebrow font-semibold uppercase text-volt">
        {asOffer ? strings.admin.notifyOfferTitle : strings.admin.notifyTitle}
      </h3>
      <p className="m-0 mt-2 text-small text-muted">
        {asOffer ? strings.admin.notifyOfferLede : strings.admin.notifyLede}
      </p>

      <form action={formAction} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-2">
          <span className="field-label">{strings.admin.notifyTitleLabel}</span>
          <input
            name="title"
            required
            maxLength={120}
            defaultValue={defaultTitle}
            data-testid="notify-title"
            className="field"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="field-label">{strings.admin.notifyBodyLabel}</span>
          <textarea
            name="body"
            required
            rows={3}
            maxLength={1000}
            defaultValue={defaultBody}
            data-testid="notify-body"
            className="field resize-y"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            data-testid="notify-submit"
            className="inline-flex min-h-11 items-center rounded-pill bg-volt px-5 text-body font-bold text-ink transition-colors hover:bg-volt-dim disabled:opacity-50"
          >
            {pending ? strings.common.loading : strings.admin.notifySend}
          </button>

          {asOffer && (
            <button
              type="button"
              onClick={() => setDismissed(true)}
              data-testid="notify-dismiss"
              className="min-h-11 bg-transparent text-small font-semibold text-muted transition-colors hover:text-bone"
            >
              {strings.admin.notifyDismiss}
            </button>
          )}
        </div>

        {state.status === "sent" && (
          <p data-testid="notify-sent" className="m-0 text-small text-volt">
            {strings.admin.notifySent}
          </p>
        )}
        {state.status === "error" && state.message && (
          <p role="alert" data-testid="notify-error" className="m-0 text-small text-warn">
            {state.message}
          </p>
        )}
      </form>
    </section>
  );
}
