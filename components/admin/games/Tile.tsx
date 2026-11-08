/**
 * A figure tile on the games list and a game's page (round 42, the admin
 * rebuild) — `StatCard`'s look, with two things it cannot do: the value may be
 * a node (a signed profit in its own tone), and the value carries its own test
 * hook, because `admin-capacity` and `admin-waitlist-depth` are asserted as
 * exactly "3/12" and "0" — the card's label beside them would break both.
 *
 * The figure shrinks with the viewport below `md`: two tiles a row at 390px
 * leave about 130px for "−1,200 CZK", which the 34px display face overflows.
 */
export function Tile({
  label,
  value,
  detail,
  testId,
  valueTestId,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  testId?: string;
  valueTestId?: string;
}) {
  return (
    <div data-testid={testId} className="lifted min-w-0 rounded-card p-4 md:p-5">
      <div className="text-[10px] uppercase tracking-eyebrow text-volt-dim">{label}</div>
      <div
        data-testid={valueTestId}
        className="mt-2 truncate font-display text-[clamp(24px,7vw,34px)] leading-none tabular-nums text-volt"
      >
        {value}
      </div>
      {detail && <div className="mt-2 truncate text-[11px] tracking-[1px] text-muted">{detail}</div>}
    </div>
  );
}

/** Two tiles a row on a phone, four from `md` — the rebuild's KPI row. */
export function TileRow({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <div data-testid={testId} className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {children}
    </div>
  );
}
