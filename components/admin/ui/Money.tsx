import { formatCzk } from "@/lib/format";

/**
 * A crown amount that can be a loss (round 42, the admin rebuild): profit on a
 * game row, on the game page, on the money page. Volt when the game made
 * money, danger when it lost, muted at exactly zero — and a real minus sign,
 * because a hyphen before a number reads as a dash.
 */
export function SignedCzk({
  amount,
  className = "",
  testId,
}: {
  amount: number;
  className?: string;
  testId?: string;
}) {
  const rounded = Math.round(amount);
  const tone = rounded > 0 ? "text-volt" : rounded < 0 ? "text-danger" : "text-muted";
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return (
    <span data-testid={testId} data-amount={rounded} className={`tabular-nums ${tone} ${className}`}>
      {sign}
      {formatCzk(Math.abs(rounded))}
    </span>
  );
}
