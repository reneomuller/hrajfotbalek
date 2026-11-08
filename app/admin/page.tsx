import type { Metadata } from "next";
import { DashboardGameRow } from "@/components/admin/shell/DashboardGameRow";
import { DashboardTile } from "@/components/admin/shell/DashboardTile";
import { PaymentAttention } from "@/components/admin/shell/PaymentAttention";
import { QuickActions } from "@/components/admin/shell/QuickActions";
import { RecentSignups } from "@/components/admin/shell/RecentSignups";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Panel } from "@/components/admin/ui/Panel";
import { getAdminDashboard } from "@/lib/admin/dashboard";
import { listPaymentsNeedingAttention } from "@/lib/admin/queries";
import { attentionLede, dashboardTiles } from "@/lib/admin/shell/dashboardView";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.admin.dashboardTitle };
export const dynamic = "force-dynamic";

/**
 * `/admin` — THE DASHBOARD (round 8, item 2), from `p14`; rebuilt in round 42.
 *
 * IN THE ORDER IT IS READ. The title line says whether anything needs a human;
 * the one thing that can — a payment with no seat — sits directly beneath it;
 * then the four figures, then the next six games with how full each is, the
 * newest sign-ups, and the quick actions. The owner: "it's not very appealing
 * at all or easy to navigate" — so nothing is new for its own sake, and
 * everything that was here still is.
 *
 * EVERY ELEMENT LINKS TO ITS HOME ROUTE, which is the rule that keeps this a
 * dashboard rather than a fifth place facts live: tiles and rows to the games
 * and players pages, revenue to the financials page. Nothing here is the only
 * way to reach anything.
 *
 * PHONE FIRST, THEN THE ROOM. At 390px it is one column and the tiles two-up;
 * from `md` the tiles go four-up, and from `lg` the games take the wider column
 * beside the sign-ups and actions, so a laptop sees the whole board without
 * scrolling past a column of empty margin.
 *
 * ~~The "Today" page from the friend's mock~~ is not built, on the owner's
 * ruling ("let's skip the 'Today' dashboard entirely"): this page is the one
 * dashboard, made better.
 */
export default async function AdminDashboardPage() {
  await requireAdmin();
  const [d, attention] = await Promise.all([getAdminDashboard(), listPaymentsNeedingAttention()]);

  return (
    <>
      <PageHeader title={strings.admin.dashboardTitle} lede={attentionLede(attention.length)} />

      <div className="mt-6 flex flex-col gap-4">
        <PaymentAttention rows={attention} />

        {/*
          TWO-UP AT 390, FOUR-UP FROM `md`. Each tile says what it counts:
          "Total players" is signed-up accounts by `lib/admin/playerScope.ts`
          — no shadows, deleted accounts or seed fixtures — the same rule the
          players page counts by.
        */}
        <section
          data-testid="dashboard-tiles"
          aria-label={strings.admin.shell.overview}
          className="grid grid-cols-2 gap-3 md:grid-cols-4"
        >
          {dashboardTiles(d).map((tile) => (
            <DashboardTile key={tile.testId} tile={tile} />
          ))}
        </section>

        {/*
          THE BODY SPLITS AT `lg`, NOT `md`. At 768px a two-fifths column is
          240px inside, which wraps "+ CREATE GAME" inside its capsule; between
          the two the sign-ups and the actions sit side by side under the games
          instead.
        */}
        <div className="grid items-start gap-4 lg:grid-cols-5">
          {/*
            SIX ROWS, which is what `p14` draws — a dashboard is a glance, and
            "the next six" is the glance. NO `All games →`: the rows are the way
            onward, and the Games chip and the Games section link are both on
            this screen.
          */}
          <Panel
            title={strings.admin.dashboardUpcoming}
            testId="dashboard-upcoming"
            className="lg:col-span-3"
          >
            {d.rows.length === 0 ? (
              <p data-testid="dashboard-empty" className="m-0 text-small text-faint">
                {strings.admin.dashboardEmpty}
              </p>
            ) : (
              <ul className="-my-3 list-none p-0">
                {d.rows.map((row) => (
                  <li key={row.id} className="border-t border-hairline first:border-t-0">
                    <DashboardGameRow row={row} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="grid items-start gap-4 md:grid-cols-2 lg:col-span-2 lg:grid-cols-1">
            <RecentSignups signups={d.recentSignups} />
            <QuickActions />
          </div>
        </div>
      </div>
    </>
  );
}
