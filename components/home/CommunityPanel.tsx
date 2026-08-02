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
export async function CommunityPanel() {
  const t = await getStrings();
  const { community } = t.landing;

  return (
    <div
      data-testid="community-panel"
      className="flex min-w-[270px] flex-1 flex-col rounded-[20px] border border-hairline-volt-soft bg-surface-card-strong p-[22px]"
    >
      <h3
        data-testid="community-heading"
        className="m-0 mb-[6px] font-display text-community-title uppercase text-white"
      >
        {community.title}
      </h3>
      <p className="mb-4 max-w-[320px] text-[13px] leading-relaxed text-muted-dim">
        {community.body}
      </p>

      {/*
        Stacked and full width rather than side by side. These are the two
        primary outbound actions on the page and at phone width a wrapped pair
        put one of them on its own line anyway — at ragged widths, which read
        as a layout accident rather than a choice.
      */}
      <div className="mt-auto flex flex-col gap-[10px]">
        <a
          href={community.whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="community-whatsapp"
          className="flex min-h-11 items-center gap-3 rounded-cta border border-hairline-link px-4 py-3 font-condensed text-[15px] font-bold tracking-wide text-bone no-underline transition hover:border-whatsapp"
        >
          <WhatsAppIcon />
          {community.whatsapp}
        </a>
        <a
          href={community.instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="community-instagram"
          className="flex min-h-11 items-center gap-3 rounded-cta border border-hairline-link px-4 py-3 font-condensed text-[15px] font-bold tracking-wide text-bone no-underline transition hover:border-instagram"
        >
          <InstagramIcon />
          {community.instagram}
        </a>
      </div>
    </div>
  );
}
