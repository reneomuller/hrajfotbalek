import type { Metadata } from "next";
import { ContactForm } from "@/components/admin/ContactForm";
import { NotifyForm } from "@/components/admin/NotifyForm";
import { SiteSettingsForms } from "@/components/admin/SiteSettingsForms";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Panel } from "@/components/admin/ui/Panel";
import { potmCandidates } from "@/lib/admin/shell/potmCandidates";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getContactDetails, getHomeContent } from "@/lib/home/queries";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";
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
 *
 * THREE PANELS, IN THE ORDER THE OWNER USES THEM (round 42, the admin
 * rebuild): what the landing page claims — the two numbers and the Player of
 * the Month — across the full width, because the numbers sit side by side
 * there as they do on the home page; then how people reach us and the
 * broadcast, side by side on a wide screen and stacked on a phone.
 */
export default async function AdminSitePage() {
  await requireAdmin();

  const service = createServiceRoleSupabaseClient();
  const [{ data: players }, home, contact] = await Promise.all([
    service
      .from("players")
      .select("id, nickname, auth_user_id, deleted_at, is_seed")
      .order("nickname", { ascending: true }),
    getHomeContent(),
    // The same singleton row `getHomeContent` reads, asked for separately —
    // the form needs the raw lists, and the home content deliberately does not
    // carry them.
    getContactDetails(strings.siteFooter.contactEmail),
  ]);

  const currentPick = home.playerOfMonth?.nickname ?? null;

  return (
    <>
      <PageHeader title={strings.admin.siteTitle} lede={strings.admin.siteLede} />

      <div className="mt-6 flex flex-col gap-4">
        <Panel title={strings.admin.shell.siteNumbersTitle} testId="site-home-numbers">
          {/*
            THE PICKER OFFERS PLAYERS WHO COUNT (round 42) — not the shadow
            names games are booked under, deleted accounts or seed fixtures —
            and always the current pick, so saving cannot clear it by accident.
          */}
          <SiteSettingsForms
            activePlayers={home.activePlayers}
            gamesPerWeek={home.gamesPerWeek}
            players={potmCandidates(players ?? [], currentPick)}
            currentPlayerOfMonth={currentPick}
          />
        </Panel>

        <div className="grid items-start gap-4 md:grid-cols-2">
          {/*
            CONTACT INFO (round 13, item 18).

            On this screen for the same reason the notify block beside it is:
            this is where the owner already comes to change what the site SAYS,
            as opposed to what it does. The footer's dialog reads exactly these
            two lists, and saving here changes every page without a deploy.
          */}
          <Panel title={strings.admin.siteContactTitle} testId="contact-section">
            <p className="m-0 mb-4 text-small text-muted">{strings.admin.siteContactLede}</p>
            <ContactForm emails={contact.emails} phones={contact.phones} />
          </Panel>

          {/*
            NOTIFY PLAYERS (round 7, item 5).

            On the home-page settings screen because that is where the owner
            already goes to say something to everybody — the active-player
            number and the Player of the Month live here, and a broadcast is
            the same kind of act.
          */}
          <NotifyForm />
        </div>
      </div>
    </>
  );
}
