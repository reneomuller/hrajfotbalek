"use client";

import { useActionState, useState } from "react";
import { publishNotificationAction, type NotifyState } from "@/app/notifications/actions";
import { PendingButton } from "@/components/form/PendingButton";
import { strings } from "@/lib/strings";

const INITIAL: NotifyState = { status: "idle" };

/** The input limits — the same numbers the fields carry as `maxLength`. */
const TITLE_MAX = 120;
const BODY_MAX = 1000;

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
 *
 * CONTROLLED (round 42). The fields were `defaultValue`, and React resets an
 * uncontrolled `<form action={…}>` once the action returns — a refused send
 * included — so a message that failed to go out was wiped with the error still
 * on screen. Now a refused send keeps every word, and a SENT one clears the
 * standing box, which the reset used to do by accident.
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
  const [title, setTitle] = useState(defaultTitle);
  const [body, setBody] = useState(defaultBody);
  const [state, formAction] = useActionState(
    async (previous: NotifyState, formData: FormData): Promise<NotifyState> => {
      const result = await publishNotificationAction(previous, formData);
      if (result.status === "sent") {
        setTitle("");
        setBody("");
      }
      return result;
    },
    INITIAL,
  );
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  // After a send the offer disappears; the standing box stays and says so.
  if (state.status === "sent" && asOffer) return null;

  return (
    <section
      data-testid={asOffer ? "notify-offer" : "notify-form"}
      className={`rounded-card p-4 sm:p-5 ${asOffer ? "border-2 border-hairline-volt bg-surface-raised" : "lifted"}`}
    >
      <h3 className="m-0 text-[10px] font-normal uppercase tracking-eyebrow text-volt-dim">
        {asOffer ? strings.admin.notifyOfferTitle : strings.admin.notifyTitle}
      </h3>
      <p className="m-0 mt-2 text-small text-muted">
        {asOffer ? strings.admin.notifyOfferLede : strings.admin.notifyLede}
      </p>

      <form action={formAction} className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="flex items-baseline justify-between gap-3">
            <span className="field-label">{strings.admin.notifyTitleLabel}</span>
            <Count length={title.length} max={TITLE_MAX} />
          </span>
          <input
            name="title"
            required
            maxLength={TITLE_MAX}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            data-testid="notify-title"
            className="field"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="flex items-baseline justify-between gap-3">
            <span className="field-label">{strings.admin.notifyBodyLabel}</span>
            <Count length={body.length} max={BODY_MAX} />
          </span>
          <textarea
            name="body"
            required
            rows={4}
            maxLength={BODY_MAX}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            data-testid="notify-body"
            className="field resize-y"
          />
        </label>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <PendingButton label={strings.admin.notifySend} testId="notify-submit" />

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
        </div>
      </form>
    </section>
  );
}

/** `12 / 120` beside a field's label — how much room the message has left. */
function Count({ length, max }: { length: number; max: number }) {
  return (
    <span aria-hidden className="text-[12px] tabular-nums text-faint">
      {strings.admin.shell.notifyCount.replace("{n}", String(length)).replace("{max}", String(max))}
    </span>
  );
}
