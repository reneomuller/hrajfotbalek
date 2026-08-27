import Link from "next/link";
import { ContactDialog } from "@/components/chrome/ContactDialog";
import { getContactDetails } from "@/lib/home/queries";
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
  const contact = await getContactDetails(t.siteFooter.contactEmail);
  const { siteFooter } = t;

  /*
   * `min-h-11` AND `items-center`, NOT JUST TYPE (audit F17/F6).
   *
   * These measured 18.2px tall — the smallest interactive targets in the
   * product, on all thirty-three pages. The 44px floor is this product's own
   * (round 14, item 5: "below the 44px tap target floor everything else in
   * this product respects"), and the footer was the place it had never been
   * applied.
   *
   * NOTHING MOVES VISUALLY. The links keep their size, colour and weight; the
   * hit area grows around them, and the row was already `items-center` inside
   * `py-5`, so the taller box sits inside padding that already existed. The
   * gap goes 4 to 5 only because two 44px targets touching is a different
   * mis-tap.
   */
  const linkClass =
    "flex min-h-11 items-center text-small text-faint no-underline transition hover:text-volt-dim";

  return (
    <footer
      data-testid="site-footer"
      /*
        `z-[2]`, NOT `z-10`, AND IT IS A BUG FIX RATHER THAN A TIDY-UP.

        The footer and every page's `<main>` are SIBLINGS, and both carried
        `relative z-10`. Equal rank means DOM order decides, and the footer
        comes second — so the footer painted above main's entire subtree,
        including anything `fixed` inside it. The game page's claim bar is
        `fixed z-30`, which ranks only WITHIN main's `z-10` context and
        therefore lost: scrolled to the bottom of a game page,
        `elementFromPoint` at the claim bar's centre returned this element, and
        the copyright line sat on top of "Claim your spot".

        This is CLAUDE.md's portal law one control over — "z-30 is not an
        absolute rank, it is a rank within a stacking context" — and it is
        fixed here rather than at the claim bar because the footer is the one
        that never needed the height. Nothing overlaps a footer except
        page-level fixed chrome, which should win every time. Fixing it here
        fixes it for every page and every future fixed element, rather than
        for the one bar somebody noticed.

        `z-[2]` and not `z-0`: `SiteBackground` occupies `z-0` and `z-[1]`, so
        the footer still has to clear the canvas and the vignette.
      */
      className="relative z-[2] mx-auto flex w-full max-w-shell flex-wrap items-center justify-between gap-2 border-t border-hairline px-gutter py-5"
    >
      <div className="flex items-center gap-5">
        <Link href="/privacy" className={linkClass}>
          {siteFooter.privacy}
        </Link>
        <Link href="/terms" className={linkClass}>
          {siteFooter.terms}
        </Link>
        {/*
          ~~A `mailto:` to a hardcoded address.~~ A DIALOG (round 13, item 18).

          On a phone the old link opened a mail client over the site with a
          blank message, which is a lot to ask of somebody who wanted to know
          whether there is a phone number. The dialog shows what there is and
          lets them choose — and its contents come from `site_settings`, so
          the owner edits them in `/admin` without a deploy.
        */}
        <ContactDialog emails={contact.emails} phones={contact.phones} />
      </div>
      <div className="text-small text-faint">{siteFooter.copyright}</div>
    </footer>
  );
}
