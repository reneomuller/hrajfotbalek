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
      /*
        LARGER, BECAUSE IT IS NOW THE ONLY WAY IN. The pass ruling takes the
        tab off the pill and the link out of the desktop header, so this panel
        is the sole entry point to `/pass` — and it was sized as a quiet aside
        beside a nav entry that no longer exists. Padding and type step up, and
        the volt wash gets a hairline so it reads as a surface rather than as a
        tinted row.

        It stays a ROW rather than becoming a card: it sits between the day
        strip and the list, and anything taller pushes the first game card
        below the fold — which is the density criterion §2.1's geometry already
        spends most of.
      */
      className="mt-3 flex items-center justify-between gap-3 rounded-card border border-hairline-volt bg-volt/[.10] px-5 py-4 no-underline transition-colors hover:bg-volt/[.16]"
    >
      <span className="min-w-0">
        <span
          data-testid="pass-panel-title"
          className="block truncate text-body-lg font-bold text-white"
        >
          {t.pass.panelTitle}
        </span>
        <span
          data-testid="pass-panel-body"
          className="mt-[2px] block truncate text-small text-muted"
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
      <span aria-hidden className="shrink-0 text-[22px] leading-none text-volt">
        →
      </span>
    </Link>
  );
}
