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
      className="min-w-[220px] flex-1 rounded-card bg-surface p-5"
    >
      <div className="font-mono text-[10px] uppercase tracking-eyebrow text-volt-dim">
        {label}
      </div>
      {/*
        The headline and the sub-line carry their own hooks, so an assertion
        can read one number rather than scraping the card. Without them a
        regex over the card's text runs the value straight into the detail —
        "1" and "1 with credit" become "11", which is how the Phase 19 spec
        first read eleven cancellations where there was one.
      */}
      <div
        data-testid="stat-value"
        className="mt-2 font-display text-[38px] leading-none text-white"
      >
        {value}
      </div>
      {detail && (
        <div
          data-testid="stat-detail"
          className="mt-2 font-mono text-[11px] tracking-[1px] text-muted"
        >
          {detail}
        </div>
      )}
      {hint && <p className="mt-2 text-[12px] leading-snug text-muted">{hint}</p>}
    </div>
  );
}
