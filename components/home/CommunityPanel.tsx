import { InstagramIcon, WhatsAppIcon } from "@/components/BrandIcon";
import { getStrings } from "@/lib/i18n/server";

/**
 * "Join our community" — the two places the conversation actually happens.
 *
 * SPLIT OFF FROM THE NUMBERS (v1.2 §6). This panel and `StatsPanel` used to be
 * one: a heading that was itself a statistic ("JOIN A COMMUNITY OF 500+ ACTIVE
 * PLAYERS"), with the two links under it. That heading did two jobs and did
 * neither — as a call to action it buried the verb in the middle of a claim,
 * and as a statistic it could only ever carry one number, so the second one had
 * nowhere to go. Now the invitation is an invitation and the numbers are a
 * panel of numbers.
 *
 * REAL BRAND MARKS, not coloured dots — see `components/BrandIcon.tsx`. A
 * WhatsApp glyph is recognised before the label beside it is read, which is the
 * entire reason to put a mark on a button; a green circle is recognised as a
 * green circle.
 */
export async function CommunityPanel({
  gamesPerWeek = null,
  activePlayers = null,
}: {
  /** The two claims that used to be a panel of their own (Section 2, item 8). */
  gamesPerWeek?: number | null;
  activePlayers?: number | null;
} = {}) {
  const t = await getStrings();
  const { community } = t.landing;

  const declared: { key: string; value: number | null; label: string }[] = [
    { key: "games", value: gamesPerWeek, label: t.landing.statsGamesLabel },
    { key: "players", value: activePlayers, label: t.landing.statsPlayersLabel },
  ];
  const stats = declared.filter(
    (stat): stat is { key: string; value: number; label: string } => stat.value !== null,
  );

  return (
    <div
      data-testid="community-panel"
      className="flex min-w-[270px] flex-1 flex-col rounded-[20px] border border-hairline-volt bg-surface p-[22px]"
    >
      <h3
        data-testid="community-heading"
        className="m-0 mb-[6px] font-display text-community-title text-white"
      >
        {community.title}
      </h3>
      <p className="mb-4 max-w-[320px] text-[13px] leading-relaxed text-muted">
        {community.body}
      </p>

      {/*
        THE NUMBERS MOVED IN HERE (Section 2, item 8), and the standalone stats
        box is gone.

        They were split off in v1.2 §6 because one panel's heading was doing
        two jobs — "JOIN A COMMUNITY OF 500+ ACTIVE PLAYERS" buried the verb in
        a claim and could carry only one number. That reasoning is intact: the
        heading is still an invitation, and the numbers sit UNDER it as their
        own row rather than inside it. What the split cost was a full-width
        panel holding two figures and a lot of air.

        A NUMBER THAT IS NOT SET RENDERS NOTHING — "0+ games every week" on a
        landing page is worse than silence, and the row disappears entirely if
        neither is set.
      */}
      {stats.length > 0 && (
        <div data-testid="community-stats" className="mb-5 flex flex-wrap gap-x-8 gap-y-3">
          {stats.map((stat) => (
            <div key={stat.key} data-testid={`stat-${stat.key}`}>
              <div
                data-testid={`stat-${stat.key}-value`}
                className="font-display text-[34px] leading-none text-volt"
              >
                {stat.value}
                <span className="text-volt-dim">+</span>
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-eyebrow text-muted">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/*
        Stacked and full width rather than side by side. These are the two
        primary outbound actions on the page and at phone width a wrapped pair
        put one of them on its own line anyway — at ragged widths, which read
        as a layout accident rather than a choice.
      */}
      {/*
        `mt-4`, NOT `mt-auto` (verdict, Stage 5).

        `mt-auto` pushed these to the bottom of a box whose height was set by
        the FAQ panel beside it, leaving a visible gap under the body text —
        the links looked detached from the sentence that introduces them. They
        sit directly under it now, and this panel is simply shorter than its
        neighbour, which is fine: `items-stretch` on the row was making a
        height agree that never needed to.
      */}
      <div className="mt-4 flex flex-col gap-[10px]">
        <a
          href={community.whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="community-whatsapp"
          className="flex min-h-11 items-center gap-3 rounded-control border border-hairline-strong px-4 py-3 text-[15px] font-bold tracking-wide text-bone no-underline transition hover:border-whatsapp"
        >
          <WhatsAppIcon />
          {community.whatsapp}
        </a>
        <a
          href={community.instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="community-instagram"
          className="flex min-h-11 items-center gap-3 rounded-control border border-hairline-strong px-4 py-3 text-[15px] font-bold tracking-wide text-bone no-underline transition hover:border-instagram"
        >
          <InstagramIcon />
          {community.instagram}
        </a>
      </div>
    </div>
  );
}
