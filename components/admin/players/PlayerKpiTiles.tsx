import { StatCard } from "@/components/admin/StatCard";
import type { PlayerKpis } from "@/lib/admin/players/segments";
import { percentOf } from "@/lib/admin/players/segments";
import { creditsLabel } from "@/lib/pass/credits";
import { strings } from "@/lib/strings";

/**
 * The five figures at the top of the players list (round 42). Two-up on a
 * phone with the headline count across the full width, five-up once there is
 * room. Every share carries the counts it came from — StatCard's rule.
 */
const t = strings.admin.playersHub;

function share(part: number, whole: number): string {
  const percent = percentOf(part, whole);
  return percent === null ? t.noShare : t.percent.replace("{n}", String(percent));
}

export function PlayerKpiTiles({ kpis }: { kpis: PlayerKpis }) {
  return (
    <section data-testid="players-kpis" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <div className="col-span-2 flex flex-col lg:col-span-1 [&>*]:flex-1">
        <StatCard
          testId="players-kpi-total"
          label={t.kpis.players}
          value={String(kpis.players)}
          detail={t.kpis.playersDetail.replace("{shadows}", String(kpis.shadows))}
        />
      </div>
      <StatCard
        testId="players-kpi-played"
        label={t.kpis.played}
        value={String(kpis.played)}
        detail={t.kpis.playedDetail.replace("{percent}", share(kpis.played, kpis.players))}
      />
      <StatCard
        testId="players-kpi-came-back"
        label={t.kpis.cameBack}
        value={kpis.cameBackPercent === null ? t.noShare : t.percent.replace("{n}", String(kpis.cameBackPercent))}
        detail={t.kpis.cameBackDetail
          .replace("{cameBack}", String(kpis.cameBack))
          .replace("{played}", String(kpis.played))}
      />
      <StatCard
        testId="players-kpi-credit"
        label={t.kpis.credit}
        value={String(kpis.withCredit)}
        detail={t.kpis.creditDetail.replace("{credits}", creditsLabel(kpis.creditsHeld, "en", strings))}
      />
      <StatCard
        testId="players-kpi-opted-in"
        label={t.kpis.optedIn}
        value={String(kpis.optedIn)}
        detail={t.kpis.optedInDetail.replace("{percent}", share(kpis.optedIn, kpis.players))}
      />
    </section>
  );
}
