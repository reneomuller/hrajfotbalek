/**
 * A ranked list with a bar per row (round 42, the admin rebuild): players by
 * country, by skill, revenue by how it was paid. The count AND the share,
 * always both — StatCard's rule: a percentage with no denominator is
 * unreadable at this scale.
 */
export interface BreakdownRow {
  key: string;
  label: React.ReactNode;
  value: number;
  /** What to print for the value; defaults to the number. */
  display?: string;
}

export function BreakdownBars({
  rows,
  testId = "breakdown",
  emptyText,
}: {
  rows: BreakdownRow[];
  testId?: string;
  emptyText?: string;
}) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  if (rows.length === 0 || total <= 0) {
    return emptyText ? <p className="text-small text-muted">{emptyText}</p> : null;
  }
  const top = Math.max(...rows.map((row) => row.value));

  return (
    <ul data-testid={testId} className="flex flex-col gap-[10px]">
      {rows.map((row) => {
        const percent = Math.round((row.value / total) * 100);
        return (
          <li key={row.key} data-testid={`${testId}-row`} data-key={row.key}>
            <div className="flex items-baseline justify-between gap-3 text-small">
              <span className="min-w-0 truncate text-bone">{row.label}</span>
              <span className="shrink-0 tabular-nums text-muted">
                <span className="font-semibold text-white">{row.display ?? row.value}</span> · {percent}%
              </span>
            </div>
            <div className="mt-[5px] h-[5px] w-full overflow-hidden rounded-pill bg-surface-seg">
              <div
                className="h-full rounded-pill bg-volt"
                /* The width is the data. Scaled to the largest row, so the
                   leader fills the track and the rest read against it. */
                style={{ width: `${(row.value / top) * 100}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
