/**
 * A metric tile.
 *
 * The headline is the derived figure and the sub-line is the raw counts it
 * came from, always both: a percentage with no denominator is unreadable at
 * launch scale, where "50% conversion" is as likely to mean 1 of 2 as 500 of
 * 1000.
 *
 * ROUND 42 (the admin rebuild): the money page's four KPI tiles are this card
 * too, so a tile reads the same at the top of the page and in Operations. The
 * figure is sized to the viewport — a five-figure crown amount fits a 390px
 * screen two-up — and `tone` lets the one tile that asks for something
 * (Outstanding) say so in warn rather than volt.
 */
const TONE = {
  volt: "text-volt",
  white: "text-white",
  warn: "text-warn",
} as const;

export function StatCard({
  label,
  value,
  detail,
  hint,
  testId,
  tone = "volt",
  className = "",
}: {
  label: string;
  value: string;
  /** The counts behind the figure — or, on Revenue, the change on last month. */
  detail?: React.ReactNode;
  hint?: string;
  testId?: string;
  tone?: keyof typeof TONE;
  /** Grid placement only; what a card looks like is decided here. */
  className?: string;
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
      className={`lifted flex min-w-0 flex-col rounded-card p-4 sm:p-5 ${className}`}
    >
      <div className="text-[10px] uppercase tracking-eyebrow text-volt-dim">{label}</div>
      {/*
        The headline and the sub-line carry their own hooks, so an assertion
        can read one number rather than scraping the card. Without them a
        regex over the card's text runs the value straight into the detail —
        "1" and "1 with credit" become "11", which is how the Phase 19 spec
        first read eleven cancellations where there was one.
      */}
      <div
        data-testid="stat-value"
        /* VOLT by default, matching the reference. The figure is the whole
           point of the tile, and white made four of them read as four
           paragraphs. */
        className={`mt-2 font-display text-[length:clamp(22px,6.4vw,34px)] leading-none tabular-nums ${TONE[tone]}`}
      >
        {value}
      </div>
      {detail && (
        <div data-testid="stat-detail" className="mt-2 text-[12px] tabular-nums tracking-[0.5px] text-muted">
          {detail}
        </div>
      )}
      {hint && <p className="mt-auto pt-2 text-[12px] leading-snug text-faint">{hint}</p>}
    </div>
  );
}
