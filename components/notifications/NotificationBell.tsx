"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { dismissNotificationsAction } from "@/app/notifications/actions";
import { useStrings } from "@/components/LocaleProvider";
import { markNotificationsReadAction } from "@/app/notifications/actions";
import type { NotificationRow } from "@/lib/notifications/queries";

/**
 * The header bell and its dropdown (round 7, item 5) — `p13`.
 *
 * PORTALLED INTO `document.body`, and this is not tidiness. CLAUDE.md's
 * standing law: `z-50` is a rank WITHIN a stacking context, and most page
 * shells here are `<main className="relative z-10">` while the nav pill is
 * `fixed z-40` at the document root. A dropdown rendered inside the header
 * competes on the header's terms; portalled, it competes on equal ones. The
 * cancel dialog is the worked example and it was found by a spec, not by eye.
 *
 * MARK-READ FIRES ON OPEN, ONCE PER MOUNT. The alternative — per-item read
 * receipts — is a control nobody uses on a list this short, and "I saw them"
 * is what opening the panel means. `markedRef` stops a second open from
 * re-posting; the RPC is idempotent anyway, so this saves a round trip rather
 * than preventing a bug.
 *
 * THE DOT IS OPTIMISTIC. It clears the moment the panel opens rather than
 * waiting for the server, because the read already happened — the person is
 * looking at them. The server state catches up on the next render and agrees.
 *
 * IT RENDERS NOTHING WHEN THE STORE IS UNREACHABLE. Between this shipping and
 * the migration being applied there is nothing to show, and a bell that opens
 * onto a permanent "no notifications" is a worse answer than no bell.
 */
export function NotificationBell({
  items,
  canDismiss = false,
  unread,
  available,
}: {
  items: NotificationRow[];
  /**
   * Whether this database can dismiss (round 16, item 13). False hides the
   * control — `dismiss_all_notifications` arrives with the round-16 migration
   * and the code ships first.
   */
  canDismiss?: boolean;
  unread: number;
  available: boolean;
}) {
  const t = useStrings();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(false);
  const markedRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // ESCAPE CLOSES IT, which is the one keyboard affordance a dropdown owes.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!available) return null;

  const showDot = unread > 0 && !seen;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setSeen(true);
      if (!markedRef.current && unread > 0) {
        markedRef.current = true;
        void markNotificationsReadAction();
      }
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        data-testid="notification-bell"
        data-unread={showDot ? "true" : "false"}
        aria-expanded={open}
        aria-label={t.notifications.bellLabel}
                /*
          `min-h-11` — THE 44px FLOOR, IN THE CHROME (audit F15/F6).
          Measured 40px on 24-33 pages. The visual size is unchanged;
          only the hit area grows to the floor this product states for
          everything else.
        */
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-pill border border-hairline-strong bg-surface text-bone transition-colors hover:border-hairline-volt"
      >
        <Icon name="bell" className="h-5 w-5" />
        {showDot && (
          <span
            aria-hidden
            data-testid="notification-dot"
            className="absolute right-[6px] top-[6px] h-[9px] w-[9px] rounded-pill border-2 border-ink bg-volt"
          />
        )}
      </button>

      {/*
        PORTALLED ONLY WHEN OPEN, which is also why no `mounted` flag is
        needed. The first version set one in an effect to prove a document
        existed — and the lint rule caught it: setting state synchronously in
        an effect triggers a cascading render on every mount of the header,
        which is every page.
        `open` can only become true from a click, and a click has already
        happened in a browser, so by then `document` is not in question.
      */}
      {open &&
        createPortal(
          <>
            {/* The dismiss surface. A click anywhere else closes the panel,
                which is what every dropdown on a phone has taught people. */}
            <button
              type="button"
              aria-label={t.common.close}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[60] cursor-default bg-transparent"
            />
            <div
              role="dialog"
              aria-label={t.notifications.bellLabel}
              data-testid="notification-panel"
              /*
                `z-[60]`, above the nav pill's `z-40` and the claim bar's
                `z-30`. An arbitrary z-index rather than a token because this
                is the FIRST portalled surface above the chrome and there is
                no scale for it yet; when a second one lands, both move to one.
              */
              className="lifted fixed right-gutter top-[68px] z-[60] max-h-[70vh] w-[min(360px,calc(100vw-2*22px))] overflow-y-auto rounded-card p-4 shadow-lift"
            >
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="m-0 text-eyebrow font-semibold uppercase text-volt">
                  {t.notifications.title}
                </h2>

                {/*
                  CLEAR ALL (round 16, item 13) — beside the heading, not under
                  the list. A control that empties a list must be reachable
                  without scrolling to the bottom of the list it empties, and
                  this panel scrolls at `max-h-[70vh]`.

                  SHOWN ONLY WITH SOMETHING TO CLEAR, and only where
                  `dismiss_all_notifications` exists. An empty bell with a
                  Clear all above it is a control that cannot do anything.

                  NO CONFIRMATION. Nothing is destroyed — dismissal is
                  per-player and the notifications themselves are untouched —
                  and a dialog for a reversible tidying action is the kind of
                  friction that teaches people to click through dialogs.
                */}
                {canDismiss && items.length > 0 && (
                  <form action={dismissNotificationsAction}>
                    <button
                      type="submit"
                      data-testid="notifications-clear"
                      className="text-small text-muted underline underline-offset-4 transition-colors hover:text-bone"
                    >
                      {t.notifications.clearAll}
                    </button>
                  </form>
                )}
              </div>

              {items.length === 0 ? (
                <p data-testid="notification-empty" className="m-0 text-small text-muted">
                  {t.notifications.empty}
                </p>
              ) : (
                <ul className="m-0 list-none p-0">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      data-testid="notification-item"
                      className="border-b border-hairline py-3 last:border-b-0 last:pb-0"
                    >
                      <div className="text-body font-semibold text-white">{item.title}</div>
                      <p className="m-0 mt-1 text-small leading-snug text-muted">
                        {item.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
