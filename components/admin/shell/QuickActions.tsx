import Link from "next/link";
import { Panel } from "@/components/admin/ui/Panel";
import { strings } from "@/lib/strings";

/*
 * p14 sets these in tracked capitals; the rest of the product does not, and
 * ruling B made `eyebrow` the only uppercase style. This is the frame's
 * treatment on the frame's own page — four capsules that read as one control
 * group — and it stops at the admin dashboard.
 */
const CAPSULE =
  "flex min-h-11 items-center justify-center rounded-pill border-2 px-3 py-3 text-center text-[11px] font-bold uppercase tracking-[1.5px] no-underline transition-colors";
const OUTLINED = `${CAPSULE} border-hairline-volt text-volt hover:border-volt active:border-volt`;
/* Creating a game is what the panel is opened for most; it is the filled one. */
const PRIMARY = `${CAPSULE} border-volt bg-volt text-ink hover:bg-volt-dim active:bg-volt-dim`;

/**
 * ALL FOUR OF p14's QUICK ACTIONS (round 10, item 1), and the two lists you go
 * to when the answer is not on the board (round 13, item 20).
 *
 *   · EXPORT DATA is `/admin/stats/transactions`, the CSV round 8 built for
 *     the financials page — a plain `<a>`, because it is a download.
 *   · ADD VENUE is `/admin/venues` (round 13, item 24): a venue outlives every
 *     game played on it, so it is not a side effect of making one.
 *
 * GAMES AND PLAYERS ARE SECTIONS, NOT PILLS. The chip row already reaches
 * both; these are the dashboard finishing its own sentence — "and if it is not
 * here, it is there".
 */
export function QuickActions() {
  return (
    <Panel title={strings.admin.quickActions} testId="dashboard-quick-actions">
      <div className="grid grid-cols-2 gap-2.5">
        <Link href="/admin/games/new" data-testid="quick-create-game" className={PRIMARY}>
          {strings.admin.quickCreateGame}
        </Link>
        <Link href="/admin/venues" data-testid="quick-add-venue" className={OUTLINED}>
          {strings.admin.quickAddVenue}
        </Link>
        <a href="/admin/stats/transactions" data-testid="quick-export" className={OUTLINED}>
          {strings.admin.quickExportData}
        </a>
        <Link href="/admin/stats" data-testid="quick-financials" className={OUTLINED}>
          {strings.admin.financialsTitle}
        </Link>
      </div>

      <div data-testid="dashboard-sections" className="mt-4 grid grid-cols-2 gap-2.5 border-t border-hairline pt-4">
        {[
          { href: "/admin/games", label: strings.admin.navGames, testId: "dashboard-to-games" },
          { href: "/admin/players", label: strings.admin.navPlayers, testId: "dashboard-to-players" },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            data-testid={link.testId}
            className="flex min-h-11 items-center justify-between rounded-control border border-hairline-strong px-4 py-2.5 text-body font-semibold text-bone no-underline transition-colors hover:border-hairline-volt active:border-hairline-volt"
          >
            {link.label}
            <span aria-hidden="true" className="text-volt">
              →
            </span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}
