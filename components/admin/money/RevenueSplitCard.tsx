import type { RevenueSplit } from "@/lib/admin/money/revenue";
import { formatCzk } from "@/lib/format";
import { strings } from "@/lib/strings";

/**
 * The second revenue box (the owner, 2026-11-08: "one box with total and the
 * other with the split of the two"): what the period's money paid for — single
 * games and Game Passes, and Credit top-ups only when there were any, so the
 * box always adds up to the total beside it. StatCard's look; its own markup,
 * because a split is two figures, not one.
 */
export function RevenueSplitCard({ split }: { split: RevenueSplit }) {
  const copy = strings.admin.money;
  const lines: { key: string; label: string; czk: number }[] = [
    { key: "games", label: copy.splitGames, czk: split.gamesCzk },
    { key: "pass", label: copy.splitPass, czk: split.passCzk },
  ];
  if (split.topupCzk > 0) lines.push({ key: "topups", label: copy.splitTopups, czk: split.topupCzk });

  return (
    <div data-testid="financials-revenue-split" className="lifted flex min-w-0 flex-col rounded-card p-4 sm:p-5">
      <div className="text-[10px] uppercase tracking-eyebrow text-volt-dim">{copy.splitLabel}</div>
      <dl className="m-0 mt-2 flex flex-col gap-2">
        {lines.map((line) => (
          <div key={line.key} data-testid={`revenue-split-${line.key}`} className="min-w-0">
            <dt className="text-[11px] text-muted">{line.label}</dt>
            <dd className="m-0 font-display text-[length:clamp(18px,5vw,24px)] leading-none tabular-nums text-volt">
              {formatCzk(line.czk)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-auto pt-2 text-[12px] leading-snug text-faint">{copy.splitHint}</p>
    </div>
  );
}
