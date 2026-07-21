import Link from "next/link";
import { strings } from "@/lib/strings";

const { siteFooter } = strings;

/**
 * Slim site-wide legal strip, rendered once from the root layout beneath the
 * page content. The landing page keeps its own brand footer above this — they
 * are different things: that one is design, this one is the privacy link the
 * signup consent copy points at.
 *
 * `/privacy` itself is Phase 27's deliverable and 404s until then, matching the
 * existing link in `components`-side signup copy.
 */
export function SiteFooter() {
  return (
    <footer className="relative z-10 mx-auto flex w-full max-w-shell flex-wrap items-center justify-between gap-2 border-t border-hairline px-gutter py-5">
      <Link
        href="/privacy"
        className="font-mono text-[10px] tracking-[2px] text-dim no-underline transition hover:text-volt-dim"
      >
        {siteFooter.privacy}
      </Link>
      <div className="font-mono text-[10px] tracking-[2px] text-dim">
        {siteFooter.copyright}
      </div>
    </footer>
  );
}
