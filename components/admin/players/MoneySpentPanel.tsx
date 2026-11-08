import { SectionHeading } from "@/components/admin/players/SectionHeading";
import { BreakdownBars } from "@/components/admin/ui/BreakdownBars";
import { Panel } from "@/components/admin/ui/Panel";
import type { PlayerSpend } from "@/lib/admin/players/spend";
import { formatCzk } from "@/lib/format";
import { strings } from "@/lib/strings";

const t = strings.admin.playersHub;

/**
 * What this player has paid, split by how (round 42). Only rendered once
 * `app_capabilities()` says `pitchCosts` — before that `booking_seat_values`
 * does not exist and PostgREST would answer with a 404.
 */
export function MoneySpentPanel({ spend }: { spend: PlayerSpend }) {
  const rows = [
    { key: "single", label: t.spendKinds.single, value: spend.singleCzk },
    { key: "pass", label: t.spendKinds.pass, value: spend.passCzk },
    { key: "credit", label: t.spendKinds.credit, value: spend.creditCzk },
    { key: "kept", label: t.spendKinds.kept, value: spend.keptCzk },
  ]
    .filter((row) => row.value > 0)
    .map((row) => ({ ...row, display: formatCzk(row.value) }));

  return (
    <Panel testId="admin-player-spend">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:items-start">
        <div>
          <SectionHeading title={t.playerKpis.spent} />
          <div data-testid="admin-player-spend-total" className="font-display text-[34px] leading-none tabular-nums text-volt">
            {formatCzk(spend.totalCzk)}
          </div>
          <p className="m-0 mt-2 max-w-[360px] text-[11px] leading-snug text-muted">{t.playerKpis.spentDetail}</p>
        </div>
        <BreakdownBars rows={rows} testId="admin-player-spend-split" emptyText={t.playerKpis.spentEmpty} />
      </div>
    </Panel>
  );
}
