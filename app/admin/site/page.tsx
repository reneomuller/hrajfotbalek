import type { Metadata } from "next";
import { SiteSettingsForms } from "@/components/admin/SiteSettingsForms";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getHomeContent } from "@/lib/home/queries";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";
import { NotifyForm } from "@/components/admin/NotifyForm";
import { strings } from "@/lib/strings";

export const metadata: Metadata = {
  title: strings.admin.siteTitle,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * `/admin/site` — the home page's editable content (§6).
 *
 * The player list is read with the service-role client, like every other admin
 * read in this codebase: `players_select_own` restricts an authenticated
 * session to its own row, and widening that policy to admit admins would put
 * an elevation path in the row policy of a table anonymous visitors read
 * nothing from. Reads here, writes through the admin's own session client.
 */
export default async function AdminSitePage() {
  await requireAdmin();

  const service = createServiceRoleSupabaseClient();
  const [{ data: players }, home] = await Promise.all([
    service
      .from("players")
      .select("id, nickname")
      .order("nickname", { ascending: true }),
    getHomeContent(),
  ]);

  return (
    <>
      {/* Anton at `page-title` — p18 draws this heading in the display face,
          and every other page heading in the product moved to this step in
          round 3. This one was left on a 22px body-bold. */}
      <h2 className="m-0 font-display text-title uppercase tracking-wide text-white">
        {strings.admin.siteTitle}
      </h2>
      <p className="mt-2 max-w-[560px] text-[13px] leading-relaxed text-muted">
        {strings.admin.siteLede}
      </p>

      <SiteSettingsForms
        activePlayers={home.activePlayers}
        gamesPerWeek={home.gamesPerWeek}
        players={players ?? []}
        currentPlayerOfMonth={home.playerOfMonth?.nickname ?? null}
      />
      {/*
        NOTIFY PLAYERS (round 7, item 5).

        On the home-page settings screen because that is where the owner
        already goes to say something to everybody — the active-player number
        and the Player of the Month live here, and a broadcast is the same
        kind of act.
      */}
      <div className="mt-10">
        <NotifyForm />
      </div>

    </>
  );
}
