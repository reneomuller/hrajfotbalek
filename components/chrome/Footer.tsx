import Link from "next/link";
import { getStrings } from "@/lib/i18n/server";
import { gtmEnabled } from "@/lib/analytics/gtm";
import { CookieSettingsLink } from "@/components/consent/CookieSettingsLink";

/**
 * The slim legal strip, rendered once from the root layout beneath the page.
 *
 * The landing page keeps its own brand footer above this one. They are
 * different things and both earn their place: that one is design, this one is
 * the legal documents, on every route.
 *
 * WHAT THE LAWYER'S BRIEF PUTS HERE (items 1.1 and 1.2, 2026-10-19).
 *
 * Four links — Obchodní podmínky, Zásady zpracování osobních údajů, Zásady
 * používání cookies, Kontakt — because the terms are accepted at signup and
 * at every purchase, so they must be reachable without an account and
 * findable again by someone who wants to check what they agreed to.
 *
 * ~~The operator line~~ — operator, address, the out-of-court body and the
 * Digital Services Act's contact point — left every page on 2026-10-27, by the
 * owner's ruling over the lawyer's item 1.1: the terms (articles 1.2 and 16)
 * already carry all of it, and `/contact` keeps the addresses.
 *
 * ~~The Contact DIALOG~~ (round 13) is now the `/contact` page, which also
 * lists whatever the owner adds in `/admin`. ~~"Cookie settings"~~ is now the
 * cookie policy: with only necessary cookies there is no choice to reopen.
 *
 * RULING B: the links are `small` in sentence case — `eyebrow` is the only
 * uppercase style in the product, and a footer link is not an eyebrow.
 */
export async function Footer() {
  const t = await getStrings();
  const { siteFooter, legal } = t;

  /*
   * `min-h-11` AND `items-center`, NOT JUST TYPE (audit F17/F6).
   *
   * These measured 18.2px tall — the smallest interactive targets in the
   * product, on all thirty-three pages. The 44px floor is this product's own
   * (round 14, item 5: "below the 44px tap target floor everything else in
   * this product respects"), and the footer was the place it had never been
   * applied. The hit area grows around the text; nothing moves visually.
   */
  const linkClass =
    "flex min-h-11 items-center text-small text-faint no-underline transition hover:text-volt-dim";

  const links = [
    { href: "/terms", label: legal.termsTitle },
    { href: "/privacy", label: legal.privacyTitle },
    { href: "/cookies", label: legal.cookiesTitle },
    { href: "/contact", label: siteFooter.contact },
  ];

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
        page-level fixed chrome, which should win every time.

        `z-[2]` and not `z-0`: `SiteBackground` occupies `z-0` and `z-[1]`, so
        the footer still has to clear the canvas and the vignette.
      */
      className="relative z-[2] mx-auto flex w-full max-w-shell flex-col gap-3 border-t border-hairline px-gutter py-5"
    >
      <nav aria-label={legal.footerNavLabel} className="flex flex-wrap items-center gap-x-5">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className={linkClass}>
            {link.label}
          </Link>
        ))}
        {/*
          "NASTAVENÍ COOKIES" COMES BACK WITH THE FIRST OPTIONAL COOKIE (round
          40, Texty pro web 9.2): once GTM is configured there is a choice to
          reopen, and the banner tells the reader it lives here.
        */}
        {gtmEnabled() && <CookieSettingsLink />}
      </nav>

      <p className="m-0 text-small text-faint">{siteFooter.copyright}</p>
    </footer>
  );
}
