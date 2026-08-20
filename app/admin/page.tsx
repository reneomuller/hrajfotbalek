import type { Metadata } from "next";
import Link from "next/link";
import { getAdminDashboard } from "@/lib/admin/dashboard";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { formatCzk, formatGameDateTime } from "@/lib/format";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.admin.dashboardTitle };
export const dynamic = "force-dynamic";

/**
 * `/admin` — THE DASHBOARD (round 8, item 2), from `p14`.
 *
 * ~~`/admin` has no dashboard of its own — games are what an organizer opens
 * the panel to do. The stats page is one nav click away and is a reading
 * surface, not a landing one.~~ **REVERSED.** That was true when the landing
 * choice was "a list of games or a page of percentages". `p14` is neither: it
 * is four numbers and the next six fixtures, which answers "is everything on
 * track" before you have decided what to open.
 *
 * EVERY ELEMENT LINKS TO ITS HOME ROUTE, which is the rule that keeps this a
 * dashboard rather than a fifth place facts live. The tiles are not
 * decoration: upcoming games and the game rows go to `/admin/games`, players
 * to `/admin/players`, revenue to the financials page. Nothing here is the
 * only way to reach anything.
 *
 * THE FIFTH CHIP IS THIS PAGE. Round 7 read the clipped chip in `p14` off its
 * pixels — volt-outlined where the other four are grey, which in this system
 * means CURRENT — and inferred a Dashboard entry. The owner ruled it so; it is
 * now first in `adminNavLinks` and volt on this route.
 *
 * `+ ADD VENUE` AND `EXPORT DATA` FROM THE FRAME ARE OMITTED. Adding a venue
 * is deliberately folded into the game form (item 0, and the reasoning in
 * `app/admin/games/actions.ts`), so a separate button would be a second door
 * to a sub-form. "Export data" has no defined scope — players, games, top-ups
 * and financials each already export their own CSV, and a button that means
 * "all of it" is a decision nobody has made.
 */
export default async function AdminDashboardPage() {
  await requireAdmin();
  const d = await getAdminDashboard();

  const tiles = [
    {
      label: strings.admin.tileUpcoming,
      value: String(d.upcomingGames),
      href: "/admin/games",
      testId: "tile-upcoming",
    },
    {
      label: strings.admin.tilePlayers,
      value: String(d.totalPlayers),
      href: "/admin/players",
      testId: "tile-players",
    },
    {
      label: strings.admin.tileNewPlayers,
      value: String(d.newPlayers7d),
      href: "/admin/players",
      testId: "tile-new-players",
    },
    {
      label: strings.admin.tileRevenue,
      value: formatCzk(d.revenueMonthCzk),
      href: "/admin/stats",
      testId: "tile-revenue",
    },
  ];

  return (
    <>
      <h2 className="m-0 font-display text-page-title uppercase tracking-wide text-white">
        {strings.admin.dashboardTitle}
      </h2>

      {/* Two-up, as p14 draws them. */}
      <section data-testid="dashboard-tiles" className="mt-5 grid grid-cols-2 gap-4">
        {tiles.map((tile) => (
          <Link
            key={tile.testId}
            href={tile.href}
            data-testid={tile.testId}
            className="lifted rounded-card p-5 no-underline transition-colors hover:border-hairline-volt"
          >
            <div className="text-eyebrow font-semibold uppercase text-muted">
              {tile.label}
            </div>
            {/* Anton at display scale — R5's "large counters". */}
            <div className="mt-2 font-display text-[32px] leading-none text-volt">
              {tile.value}
            </div>
          </Link>
        ))}
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="m-0 font-display text-section-title uppercase tracking-wide text-white">
            {strings.admin.dashboardUpcoming}
          </h3>
          <Link
            href="/admin/games"
            data-testid="dashboard-all-games"
            className="text-small font-semibold text-volt no-underline"
          >
            {strings.admin.dashboardAllGames}
          </Link>
        </div>

        {d.rows.length === 0 ? (
          <p data-testid="dashboard-empty" className="mt-4 text-small text-faint">
            {strings.admin.dashboardEmpty}
          </p>
        ) : (
          <ul className="lifted mt-4 list-none rounded-card p-0">
            {d.rows.map((row) => (
              <li key={row.id} className="border-b border-hairline last:border-b-0">
                <Link
                  href={`/admin/games/${row.id}`}
                  data-testid="dashboard-game-row"
                  className="flex items-center justify-between gap-3 px-5 py-4 no-underline"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-body font-semibold text-white">
                      {row.venue}
                    </span>
                    <span className="block truncate text-small text-muted">
                      {formatGameDateTime(row.startsAt)}
                      {row.organizer ? ` · ${row.organizer}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    {/*
                      `booked / capacity` — the one number that decides whether
                      an organizer has to do anything about this game today.
                    */}
                    <span className="block text-body font-bold text-volt">
                      {row.booked} / {row.capacity}
                    </span>
                    <span className="block text-eyebrow uppercase text-muted">
                      {row.status}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* p14's quick actions, minus the two with no destination — see above. */}
      <section className="mt-8">
        <h3 className="m-0 font-display text-section-title uppercase tracking-wide text-white">
          {strings.admin.quickActions}
        </h3>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Link
            href="/admin/games/new"
            data-testid="quick-create-game"
            className="flex min-h-11 items-center justify-center rounded-pill border-2 border-hairline-volt px-4 py-3 text-small font-bold text-volt no-underline transition-colors hover:border-volt"
          >
            {strings.admin.quickCreateGame}
          </Link>
          <Link
            href="/admin/stats"
            data-testid="quick-financials"
            className="flex min-h-11 items-center justify-center rounded-pill border-2 border-hairline-volt px-4 py-3 text-small font-bold text-volt no-underline transition-colors hover:border-volt"
          >
            {strings.admin.financialsTitle}
          </Link>
        </div>
      </section>
    </>
  );
}
