import Link from "next/link";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { authNavLink, primaryNavLinks, signedOutNavLinks } from "@/lib/nav/links";
import { getStrings } from "@/lib/i18n/server";


/**
 * Site-wide header, rendered once from the root layout.
 *
 * Chrome is the landing reference's fixed nav bar verbatim (`index.html`), so
 * adding navigation does not reinterpret the design. Content pages already
 * carry `pt-24`, which clears the fixed bar.
 *
 * `nickname` and `isAdmin` are resolved server-side in the layout and used for
 * DISPLAY only — see the note in `lib/nav/links.ts`. `nickname` decides which
 * auth slot to show and is never rendered here; `isAdmin` decides whether the
 * Admin link appears, and grants nothing by appearing.
 */
export async function SiteHeader({
  nickname,
  isAdmin,
}: {
  nickname: string | null;
  isAdmin: boolean;
}) {
  const t = await getStrings();
  const { brand, nav } = t;
  const auth = authNavLink({ nickname }, t);
  const signedOut = signedOutNavLinks({ nickname }, t);

  return (
    <header className="fixed inset-x-0 top-0 z-30 border-b border-hairline-chrome bg-ink/[.72] backdrop-blur-md">
      <div className="mx-auto flex max-w-shell items-center justify-between px-gutter py-[11px]">
        <Link
          href="/"
          aria-label={nav.home}
          className="flex items-center gap-[10px] no-underline"
        >
          <span className="flex h-[38px] w-[38px] items-center justify-center rounded-badge border-[1.5px] border-volt bg-surface font-condensed text-[19px] font-extrabold italic tracking-[-1px]">
            <span className="text-white">{brand.monogramLead}</span>
            <span className="text-volt">{brand.monogramAccent}</span>
          </span>
          <span className="font-condensed text-[16px] font-bold leading-none tracking-wide text-bone">
            {brand.wordmarkLead}{" "}
            <span className="text-volt">{brand.wordmarkAccent}</span>
          </span>
        </Link>

        <nav className="flex items-center gap-[14px]">
          {/*
            The language control sits before the links, not buried in a menu or
            in the footer: someone who cannot read the page has to be able to
            find its way out without reading anything, and it names the
            languages in their own alphabets so it is legible in all three.
          */}
          <LanguageSwitcher />

          {primaryNavLinks({ isAdmin }, t).map((link) => (
            <Link
              key={link.href}
              href={link.href}
              data-testid={`nav-${link.href.split("/")[1]}`}
              className="font-condensed text-[13px] font-bold uppercase tracking-wide text-bone no-underline transition hover:text-volt"
            >
              {link.label}
            </Link>
          ))}
          {/*
            Signed out, two doors: a quiet "Log in" and the volt "Sign up".
            Contract §3.1 requires both to be distinct entries — with passwords
            they are different acts, and a returning player who taps Sign up
            gets told their email is taken instead of getting in. Signed in,
            this collapses back to the single profile button.
          */}
          {signedOut.length > 0 ? (
            <>
              <Link
                href={signedOut[0].href}
                data-testid="nav-login"
                className="font-condensed text-[13px] font-bold uppercase tracking-wide text-bone no-underline transition hover:text-volt"
              >
                {signedOut[0].label}
              </Link>
              <Link
                href={signedOut[1].href}
                data-testid="nav-signup"
                className="rounded-control bg-volt px-[14px] py-2 font-condensed text-[13px] font-extrabold uppercase tracking-wide text-surface no-underline"
              >
                {signedOut[1].label}
              </Link>
            </>
          ) : (
            <Link
              href={auth.href}
              data-testid="nav-account"
              className="rounded-control bg-volt px-[14px] py-2 font-condensed text-[13px] font-extrabold uppercase tracking-wide text-surface no-underline"
            >
              {auth.label}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
