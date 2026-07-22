/**
 * A metric tile.
 *
 * The headline is the derived figure and the sub-line is the raw counts it
 * came from, always both: a percentage with no denominator is unreadable at
 * launch scale, where "50% conversion" is as likely to mean 1 of 2 as 500 of
 * 1000.
 */
export function StatCard({
  label,
  value,
  detail,
  hint,
  testId,
}: {
  label: string;
  value: string;
  detail?: string;
  hint?: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="min-w-[220px] flex-1 rounded-card border border-hairline bg-surface-card p-5"
    >
      <div className="font-mono text-[10px] uppercase tracking-eyebrow text-volt-dim">
        {label}
      </div>
      <div className="mt-2 font-display text-[38px] leading-none text-white">{value}</div>
      {detail && (
        <div className="mt-2 font-mono text-[11px] tracking-[1px] text-muted">{detail}</div>
      )}
      {hint && <p className="mt-2 text-[12px] leading-snug text-muted-dim">{hint}</p>}
    </div>
  );
}
