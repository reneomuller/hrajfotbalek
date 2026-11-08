/**
 * One figure on the player page (round 42) — `StatCard`'s look, with the test
 * hook on the NUMBER rather than the card.
 *
 * The player page's specs read the numeral on its own —
 * `admin-player-no-shows` is asserted with `toHaveText("2")` — so the hook
 * cannot sit on a card whose text also holds its label. Anything under the
 * figure goes in `children`.
 */
export function KpiTile({
  label,
  value,
  valueTestId,
  size = "lg",
  tone = "volt",
  children,
}: {
  label: string;
  value: string;
  valueTestId?: string;
  /** `md` for a figure that is words or a date rather than a count. */
  size?: "lg" | "md";
  tone?: "volt" | "white";
  children?: React.ReactNode;
}) {
  return (
    <div className="lifted flex flex-col rounded-card p-4 sm:p-5">
      <div className="text-[10px] uppercase tracking-eyebrow text-volt-dim">{label}</div>
      <div
        data-testid={valueTestId}
        className={`mt-2 font-display leading-none tabular-nums ${size === "lg" ? "text-[34px]" : "text-[22px]"} ${
          tone === "volt" ? "text-volt" : "text-white"
        }`}
      >
        {value}
      </div>
      {children && <div className="mt-2 flex flex-col gap-1 text-[11px] leading-snug text-muted">{children}</div>}
    </div>
  );
}
