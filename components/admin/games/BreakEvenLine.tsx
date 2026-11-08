import type { BreakEvenOutlook } from "@/lib/admin/games/breakEven";
import { strings } from "@/lib/strings";

const hub = strings.admin.gamesHub;

/**
 * "3 more seats to break even" (round 42, the admin rebuild) — under each
 * upcoming game on the list, and beside the break-even line on its page.
 * Volt once the pitch is paid for, warn when it cannot be any more, and quiet
 * in between: a game three seats short on a Tuesday is normal, not news.
 */
export function BreakEvenLine({
  outlook,
  testId = "admin-game-break-even",
}: {
  outlook: BreakEvenOutlook;
  testId?: string;
}) {
  if (outlook.kind === "none") return null;

  if (outlook.kind === "covered") {
    return (
      <span data-testid={testId} data-outlook="covered" className="text-volt">
        {hub.breakEvenCovered}
      </span>
    );
  }

  const text = !outlook.reachable
    ? hub.breakEvenUnreachable.replace("{n}", String(outlook.seats))
    : outlook.seats === 1
      ? hub.breakEvenShortOne
      : hub.breakEvenShort.replace("{n}", String(outlook.seats));

  return (
    <span
      data-testid={testId}
      data-outlook={outlook.reachable ? "short" : "unreachable"}
      data-seats={outlook.seats}
      className={outlook.reachable ? "text-bone" : "text-warn"}
    >
      {text}
    </span>
  );
}
