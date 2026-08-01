import type { Metadata } from "next";
import { SiteSettingsForms } from "@/components/admin/SiteSettingsForms";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getHomeContent } from "@/lib/home/queries";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";
import { strings } from "@/lib/strings";

export const metadata: Metadata = {
  title: strings.admin.siteTitle,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * `/admin/site` — the two home-page numbers (§6).
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
      <h2 className="font-condensed text-[22px] font-bold uppercase tracking-wide text-bone">
        {strings.admin.siteTitle}
      </h2>
      <p className="mt-2 max-w-[560px] text-[13px] leading-relaxed text-muted">
        {strings.admin.siteLede}
      </p>

      <SiteSettingsForms
        activePlayers={home.activePlayers}
        players={players ?? []}
        currentPlayerOfMonth={home.playerOfMonth?.nickname ?? null}
      />
    </>
  );
}
