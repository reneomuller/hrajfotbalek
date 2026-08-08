import Link from "next/link";
import { getStrings } from "@/lib/i18n/server";

/**
 * The slim legal strip, rendered once from the root layout beneath the page.
 *
 * The landing page keeps its own brand footer above this one. They are
 * different things and both earn their place: that one is design, this one is
 * the privacy link the signup consent copy points at, on every route.
 *
 * THREE LINKS, AND EACH IS LOAD-BEARING.
 *
 * Privacy, because the signup consent copy links to it and a consent that
 * points at a page nobody can reach afterwards is not evidence of anything.
 *
 * Terms, because they are a document people are asked to ACCEPT at signup —
 * so they have to be readable without signing up, and findable again by
 * someone who wants to check what they agreed to.
 *
 * Contact, because a product that takes money and holds personal data needs
 * one reachable address that is not a WhatsApp group. Data-protection requests
 * have their own address on /privacy, so they land somewhere they can be
 * answered properly rather than in a general inbox.
 *
 * RULING B: the links were tracked capitals at 10px. They are now `small` in
 * sentence case — `eyebrow` is the only uppercase style in the product, and a
 * footer link is not an eyebrow.
 */
export async function Footer() {
  const t = await getStrings();
  const { siteFooter } = t;

  const linkClass =
    "text-small text-faint no-underline transition hover:text-volt-dim";

  return (
    <footer
      data-testid="site-footer"
      className="relative z-10 mx-auto flex w-full max-w-shell flex-wrap items-center justify-between gap-2 border-t border-hairline px-gutter py-5"
    >
      <div className="flex items-center gap-4">
        <Link href="/privacy" className={linkClass}>
          {siteFooter.privacy}
        </Link>
        <Link href="/terms" className={linkClass}>
          {siteFooter.terms}
        </Link>
        <a href={`mailto:${siteFooter.contactEmail}`} className={linkClass}>
          {siteFooter.contact}
        </a>
      </div>
      <div className="text-small text-faint">{siteFooter.copyright}</div>
    </footer>
  );
}
