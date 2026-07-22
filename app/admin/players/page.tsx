import Link from "next/link";
import { GrantCreditForm } from "@/components/admin/GrantCreditForm";
import { listPlayers } from "@/lib/admin/queries";
import { formatCzk } from "@/lib/format";
import { strings } from "@/lib/strings";

export const dynamic = "force-dynamic";

/**
 * The player list: identities, wallets, and the two money/identity corrections.
 *
 * Balances are `SUM(delta_czk)` computed at read time. The ledger is
 * append-only and is the authority — a stored balance column would be a second
 * source of truth, and the first time the two disagreed the ledger would still
 * be right.
 */
export default async function AdminPlayersPage() {
  const players = await listPlayers();

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="m-0 font-condensed text-[22px] font-bold uppercase tracking-wide text-bone">
          {strings.admin.playersTitle}
        </h2>
        <Link
          href="/admin/players/merge"
          data-testid="merge-link"
          className="font-mono text-[11px] uppercase tracking-eyebrow text-volt no-underline"
        >
          {strings.admin.mergeLink}
        </Link>
      </div>

      {players.length === 0 ? (
        <p className="mt-8 font-mono text-[12px] tracking-[1px] text-faint">
          {strings.admin.playersEmpty}
        </p>
      ) : (
        <ul className="mt-6 list-none space-y-3 p-0">
          {players.map((player) => (
            <li
              key={player.id}
              data-testid="admin-player-row"
              className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-card border border-hairline bg-surface-card px-5 py-4"
            >
              <div className="min-w-[200px] flex-1">
                {/* Nickname and email are free text; JSX escapes both. */}
                <div className="flex items-baseline gap-2">
                  <span className="font-condensed text-[17px] font-bold text-white">
                    {player.nickname}
                  </span>
                  {player.isShadow && (
                    <span className="rounded-chip border border-hairline-strong px-2 py-[2px] font-mono text-[9px] uppercase tracking-eyebrow text-muted">
                      {strings.admin.shadowTag}
                    </span>
                  )}
                  {player.isSeed && (
                    <span className="rounded-chip border border-hairline-strong px-2 py-[2px] font-mono text-[9px] uppercase tracking-eyebrow text-muted">
                      {strings.admin.seedTag}
                    </span>
                  )}
                  {player.isAdmin && (
                    <span className="rounded-chip border border-hairline-volt px-2 py-[2px] font-mono text-[9px] uppercase tracking-eyebrow text-volt">
                      {strings.admin.adminTag}
                    </span>
                  )}
                </div>
                <div className="mt-1 font-mono text-[11px] tracking-[1px] text-muted">
                  {player.email ?? strings.admin.noEmail}
                </div>
              </div>

              <div className="font-mono text-[11px] tracking-[1px] text-muted">
                {strings.admin.bookingsLabel} {player.bookingCount}
              </div>

              <div
                data-testid="player-balance"
                data-balance={player.balanceCzk}
                className="font-mono text-[13px] text-volt"
              >
                {strings.admin.balanceLabel} {formatCzk(player.balanceCzk)}
              </div>

              <GrantCreditForm playerId={player.id} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
