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
 * ONE LINE, AND THE HEIGHT IS A REQUIREMENT RATHER THAN A PREFERENCE. §4.2
 * puts this panel here; §5.5 requires well more than three games visible at
 * Pixel-7 width. They compete for the same vertical space, and the first draft
 * of this panel — a title, a body line and generous padding — cost exactly one
 * row: the density spec went from six visible to four.
 *
 * So the title and the strapline sit on one line, because they were saying the
 * same thing twice, and the padding is the minimum a tap target needs. Both
 * criteria hold, and the spec that counts rows inside the viewport is what
 * says so.
 */
export async function PassPanel() {
  const t = await getStrings();

  return (
    <Link
      href="/pass"
      data-testid="pass-panel"
      className="mt-3 flex items-center justify-between gap-3 rounded-card border border-hairline-volt bg-volt/[.06] px-4 py-2 no-underline"
    >
      <span className="truncate font-condensed text-[14px] font-bold uppercase tracking-wide text-white">
        {t.pass.panelTitle}
        <span className="ml-2 font-mono text-[11px] font-normal normal-case tracking-normal text-muted-dim">
          {t.pass.panelBody}
        </span>
      </span>
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-eyebrow text-volt">
        {t.pass.panelCta}
      </span>
    </Link>
  );
}
