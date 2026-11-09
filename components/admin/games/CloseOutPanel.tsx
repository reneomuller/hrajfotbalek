import { Panel } from "@/components/admin/ui/Panel";
import type { AdminBookingRow } from "@/lib/admin/queries";
import { strings } from "@/lib/strings";
import type { GameStatus } from "@/lib/types/database";

const hub = strings.admin.gamesHub;

/**
 * The end of a game's life (round 42, the admin rebuild): Mark played while it
 * is live, the unpaid notice once it is played, Settled once it is closed —
 * and, on a cancelled game, why it was called off.
 *
 * ~~A section headed "Attendance".~~ Never again (round 16, item 16):
 * attendance is marked on the roster rows, and `admin-round16.spec.ts` fails a
 * page with a line reading just "Attendance".
 *
 * THE UNPAID NOTICE IS NEWS. The sweep closes a game the night it is played;
 * a `played` game still listing names is one it tried to close and SKIPPED,
 * because a `reserved` hold is on it — an unreconciled debt with no other
 * surface that will raise it.
 *
 * Renders nothing for a state with nothing to say (a draft).
 */
export function CloseOutPanel({
  status,
  canSettle,
  pending,
  cancelReason,
}: {
  status: GameStatus;
  canSettle: boolean;
  pending: AdminBookingRow[];
  cancelReason: string | null;
}) {
  if (status === "cancelled") {
    return (
      <Panel title={hub.cancelledTitle} testId="game-cancelled">
        {/* Admin-typed free text, escaped by JSX. */}
        <p data-testid="game-cancel-reason" className="m-0 text-small italic text-bone">
          {cancelReason ?? hub.noReason}
        </p>
      </Panel>
    );
  }

  const settled = status === "settled";
  if (!canSettle && !settled) return null;

  return (
    <Panel title={hub.closeOutTitle} testId="game-close-out">
      {/*
        ~~MARK PLAYED~~ — gone (the owner, 2026-11-09: "a game has been played
        once it finishes"). The five-minute sweep marks it at the final whistle
        (`/api/cron/played-now`); what is left here is what that sweep cannot
        settle on its own.
      */}
      {canSettle && pending.length > 0 && (
        <div data-testid="settle-outstanding" className="rounded-card border border-warn/40 bg-warn/[.06] p-4">
          <p className="m-0 text-[13px] text-bone">{strings.admin.settleBlocked}</p>
          <ul className="mt-2 list-none p-0 text-[12px] font-semibold text-warn">
            {pending.map((booking) => (
              <li key={booking.id}>{booking.nickname}</li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-muted">{strings.admin.settleBlockedHint}</p>
        </div>
      )}

      {canSettle && pending.length === 0 && (
        <p className="m-0 text-small text-bone">{hub.closeOutSweeping}</p>
      )}

      {settled && (
        <p className="m-0 text-[17px] font-bold uppercase tracking-wide text-volt">{strings.admin.settled}</p>
      )}
    </Panel>
  );
}
