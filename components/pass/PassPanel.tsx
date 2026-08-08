import Link from "next/link";
import { getStrings } from "@/lib/i18n/server";

/**
 * The pass panel, BETWEEN THE DAY-PICKER AND THE GAMES LIST (§4.2).
 *
 * That position is the requirement, and it is the right one: someone scanning
 * for a game is the person for whom pre-buying games is worth anything, and
 * they are looking at exactly this part of the page. It does not sit on the
 * account page, where only people who already decided ever go.
 *
 * IT MUST FIT A PHONE, AND THE PREVIOUS VERSION DID NOT. Title and strapline
 * shared one line, which is compact right up until the line is longer than the
 * viewport — and it was: "Top up your pass · Pre-buy games at a discount ·
 * See the passes →" runs past 360px, so the strapline was clipped mid-word by
 * the `truncate` that was supposed to be protecting the layout. A panel whose
 * only sentence is cut in half is worse than a taller panel.
 *
 * So the two lines stack and the call to action becomes an arrow. Stacking
 * costs about sixteen pixels against §5.5's density criterion, which is paid
 * for by the price coming off the rows above — and the spec that counts rows
 * inside a Pixel-7 viewport is what confirms it, not this comment.
 */
export async function PassPanel() {
  const t = await getStrings();

  return (
    <Link
      href="/pass"
      data-testid="pass-panel"
      className="mt-2 flex items-center justify-between gap-3 rounded-card border border-hairline-volt bg-volt/[.06] px-4 py-2 no-underline transition-colors hover:border-hairline-volt"
    >
      <span className="min-w-0">
        <span
          data-testid="pass-panel-title"
          className="block truncate font-condensed text-[15px] font-bold uppercase tracking-wide text-white"
        >
          {t.pass.panelTitle}
        </span>
        <span
          data-testid="pass-panel-body"
          className="mt-[1px] block truncate font-mono text-[11px] text-muted"
        >
          {t.pass.panelBody}
        </span>
      </span>
      {/*
        An arrow rather than "See the passes →". The whole panel is the link,
        so a second phrase telling you it is a link was the words that pushed
        the line past the viewport. `aria-hidden` because the accessible name
        comes from the title, which already says where this goes.
      */}
      <span aria-hidden className="shrink-0 font-mono text-[16px] leading-none text-volt">
        →
      </span>
    </Link>
  );
}
