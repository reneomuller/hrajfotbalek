import Link from "next/link";
import { Panel } from "@/components/admin/ui/Panel";
import type { DashboardSignup } from "@/lib/admin/dashboard";
import { formatDate, formatTime } from "@/lib/format";
import { strings } from "@/lib/strings";

/**
 * NEW SIGN-UPS (round 41) — the owner: "add total player count and when
 * someone creates an account — date/time of account creation". The newest
 * accounts, each with the minute it was made, in Prague time.
 *
 * PLAYERS WHO COUNT ONLY (round 42): the same rule as the tile above it, so a
 * seed fixture never shows up as somebody who just joined.
 */
export function RecentSignups({ signups }: { signups: DashboardSignup[] }) {
  return (
    <Panel title={strings.admin.dashboardSignups} testId="dashboard-signups">
      {signups.length === 0 ? (
        <p className="m-0 text-small text-faint">{strings.admin.dashboardSignupsEmpty}</p>
      ) : (
        <ul className="-my-2.5 list-none p-0">
          {signups.map((signup) => (
            <li key={signup.id} className="border-t border-hairline first:border-t-0">
              <Link
                href={`/admin/players/${signup.id}`}
                data-testid="dashboard-signup"
                className="flex min-h-11 items-baseline justify-between gap-3 py-2.5 no-underline"
              >
                <span className="min-w-0 truncate text-body font-semibold text-white">
                  {signup.nickname}
                  {signup.playerNumber !== null && (
                    <span
                      title={strings.admin.playerNumberTitle}
                      className="ml-2 text-small font-normal tabular-nums text-faint"
                    >
                      {strings.admin.playerNumber} {signup.playerNumber}
                    </span>
                  )}
                </span>
                <time
                  dateTime={signup.createdAt}
                  data-testid="dashboard-signup-at"
                  className="shrink-0 tabular-nums text-small text-muted"
                >
                  {formatDate(signup.createdAt)}, {formatTime(signup.createdAt)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
