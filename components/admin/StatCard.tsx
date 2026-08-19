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
      /*
        `lifted` AND NO `min-w-[220px]` (admin restyle).

        The floor was 220px, so at 390px minus the gutter only ONE card fitted
        per row and four metrics became four full-width bands the length of the
        screen. The reference lays them out two-up, which is what the numbers
        want: they are read against each other. The width is now the grid's
        business — see the stats page — and this component only says what a
        card looks like.
      */
      className="lifted rounded-card p-5"
    >
      <div className="text-[10px] uppercase tracking-eyebrow text-volt-dim">
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
        /* VOLT, matching the reference. The figure is the whole point of the
           tile, and white made four of them read as four paragraphs. */
        className="mt-2 font-display text-[34px] leading-none text-volt"
      >
        {value}
      </div>
      {detail && (
        <div
          data-testid="stat-detail"
          className="mt-2 text-[11px] tracking-[1px] text-muted"
        >
          {detail}
        </div>
      )}
      {hint && <p className="mt-2 text-[12px] leading-snug text-muted">{hint}</p>}
    </div>
  );
}
