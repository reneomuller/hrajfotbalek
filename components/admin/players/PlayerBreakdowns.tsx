import { CountryFlag } from "@/components/flags/CountryFlag";
import { BreakdownBars, type BreakdownRow } from "@/components/admin/ui/BreakdownBars";
import { Panel } from "@/components/admin/ui/Panel";
import { countryBreakdown, skillBreakdown } from "@/lib/admin/players/breakdowns";
import type { DirectoryPlayer } from "@/lib/admin/players/types";
import { countryName } from "@/lib/auth/countries";
import { strings } from "@/lib/strings";

/**
 * Who the players are (round 42): by country, with the flag drawn the way the
 * profiles draw it, and by the level they say they play at — counted players
 * only, each with its count and share.
 */
const t = strings.admin.playersHub;

function countryRows(players: DirectoryPlayer[]): BreakdownRow[] {
  return countryBreakdown(players).map((row) => {
    if (row.key === "other") {
      return { key: row.key, value: row.value, label: t.breakdownOther.replace("{count}", String(row.countries ?? 0)) };
    }
    if (row.key === "unset") return { key: row.key, value: row.value, label: t.breakdownUnset };
    return {
      key: row.key,
      value: row.value,
      label: (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <CountryFlag code={row.key} size="compact" />
          <span className="truncate">{countryName(row.key, "en") ?? row.key}</span>
        </span>
      ),
    };
  });
}

function skillRows(players: DirectoryPlayer[]): BreakdownRow[] {
  return skillBreakdown(players).map((row) => ({
    key: row.key,
    value: row.value,
    label: row.key === "unset" ? t.breakdownUnset : strings.admin.skillOptions[row.key],
  }));
}

export function PlayerBreakdowns({ players }: { players: DirectoryPlayer[] }) {
  const note = <span className="text-[10px] uppercase tracking-eyebrow text-faint">{t.breakdownNote}</span>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title={t.countryTitle} action={note} testId="players-by-country">
        <BreakdownBars rows={countryRows(players)} testId="country-breakdown" emptyText={t.breakdownEmpty} />
      </Panel>
      <Panel title={t.skillTitle} action={note} testId="players-by-skill">
        <BreakdownBars rows={skillRows(players)} testId="skill-breakdown" emptyText={t.breakdownEmpty} />
      </Panel>
    </div>
  );
}
