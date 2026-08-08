import Link from "next/link";
import { getStrings } from "@/lib/i18n/server";


/**
 * Slim site-wide legal strip, rendered once from the root layout beneath the
 * page content. The landing page keeps its own brand footer above this — they
 * are different things: that one is design, this one is the privacy link the
 * signup consent copy points at.
 *
 * `/privacy` itself is Phase 27's deliverable and 404s until then, matching the
 * existing link in `components`-side signup copy.
 */
export async function SiteFooter() {
  const t = await getStrings();
  const { siteFooter } = t;
  return (
    <footer className="relative z-10 mx-auto flex w-full max-w-shell flex-wrap items-center justify-between gap-2 border-t border-hairline px-gutter py-5">
      <div className="flex items-center gap-4">
        <Link
          href="/privacy"
          className="font-mono text-[10px] tracking-[2px] text-faint no-underline transition hover:text-volt-dim"
        >
          {siteFooter.privacy}
        </Link>
        {/*
          The terms are a document people are asked to accept at signup, so they
          have to be readable without signing up — and findable again afterwards
          by someone who wants to check what they agreed to.
        */}
        <Link
          href="/terms"
          className="font-mono text-[10px] tracking-[2px] text-faint no-underline transition hover:text-volt-dim"
        >
          {siteFooter.terms}
        </Link>
        {/*
          One reachable address on every page. The WhatsApp group is where the
          community lives, but a product that takes money and holds personal
          data needs a contact that does not require joining a group chat.
          Data-protection requests have their own address (`account.deleteMailto`,
          also on /privacy) so they land somewhere they can be answered properly.
        */}
        <a
          href={`mailto:${siteFooter.contactEmail}`}
          className="font-mono text-[10px] tracking-[2px] text-faint no-underline transition hover:text-volt-dim"
        >
          {siteFooter.contact}
        </a>
      </div>
      <div className="font-mono text-[10px] tracking-[2px] text-faint">
        {siteFooter.copyright}
      </div>
    </footer>
  );
}
