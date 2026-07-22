import Link from "next/link";
import { notFound } from "next/navigation";
import { AttendanceRow } from "@/components/admin/AttendanceRow";
import { SettleButton } from "@/components/admin/SettleButton";
import { TransitionButton } from "@/components/admin/TransitionButton";
import {
  activeBookings,
  availableTransitions,
  getAdminGame,
  listGameBookings,
  unpaidBookings,
} from "@/lib/admin/queries";
import { strings } from "@/lib/strings";
import { markPlayedAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Close-out: who turned up, what is still owed, and then settle.
 *
 * The correctness requirement here is unusually sharp — a `reserved` booking
 * surviving into `settled` is an unreconciled debt with no surface that will
 * ever raise it again — so the unpaid list is rendered above the settle button
 * rather than being discovered by pressing it.
 */
export default async function AttendancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const game = await getAdminGame(id);
  if (!game) notFound();

  const bookings = await listGameBookings(game.id);
  const roster = activeBookings(bookings);
  const unpaid = unpaidBookings(bookings);

  const { canPlay, canSettle } = availableTransitions(game.status);

  return (
    <>
      <Link
        href={`/admin/games/${game.id}`}
        className="font-mono text-[11px] uppercase tracking-eyebrow text-muted no-underline"
      >
        {strings.common.back}
      </Link>

      <h2 className="mt-4 font-condensed text-[22px] font-bold uppercase tracking-wide text-bone">
        {strings.admin.attendanceTitle}
      </h2>
      <p className="mt-1 font-mono text-[11px] tracking-[1px] text-muted">
        {game.venue} · {strings.admin.status[game.status]}
      </p>
      <p className="mt-3 max-w-[520px] text-[13px] leading-relaxed text-muted-dim">
        {strings.admin.attendanceLede}
      </p>

      {roster.length === 0 ? (
        <p className="mt-6 font-mono text-[12px] tracking-[1px] text-faint">
          {strings.admin.rosterEmpty}
        </p>
      ) : (
        <ul className="mt-6 list-none space-y-2 p-0">
          {roster.map((booking) => (
            <AttendanceRow key={booking.id} booking={booking} gameId={game.id} />
          ))}
        </ul>
      )}

      <div className="mt-10 border-t border-hairline-chrome pt-6">
        {/* An under-capacity game that never filled still gets played and
            settled — the state machine allows published → played for exactly
            this reason. */}
        {canPlay && (
          <TransitionButton
            action={markPlayedAction}
            gameId={game.id}
            label={strings.admin.markPlayed}
            testId="mark-played"
            tone="secondary"
          />
        )}

        {canSettle && (
          <>
            {unpaid.length > 0 && (
              <div
                data-testid="settle-outstanding"
                className="mb-4 rounded-card border border-hairline-strong p-4"
              >
                <p className="m-0 text-[13px] text-bone">{strings.admin.settleBlocked}</p>
                <ul className="mt-2 list-none p-0 font-mono text-[12px] text-volt">
                  {unpaid.map((booking) => (
                    <li key={booking.id}>{booking.nickname}</li>
                  ))}
                </ul>
                <p className="mt-2 text-[12px] text-muted">
                  {strings.admin.settleBlockedHint}
                </p>
              </div>
            )}
            <SettleButton gameId={game.id} />
          </>
        )}

        {!canPlay && !canSettle && game.status !== "settled" && (
          <p className="font-mono text-[12px] tracking-[1px] text-faint">
            {strings.admin.settleNeedsPlayed}
          </p>
        )}

        {game.status === "settled" && (
          <p className="font-condensed text-[17px] font-bold uppercase tracking-wide text-volt">
            {strings.admin.settled}
          </p>
        )}
      </div>
    </>
  );
}
