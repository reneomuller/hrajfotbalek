import Link from "next/link";
import { authNavLink, primaryNavLinks } from "@/lib/nav/links";
import { strings } from "@/lib/strings";

const { brand, nav } = strings;

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
export function SiteHeader({
  nickname,
  isAdmin,
}: {
  nickname: string | null;
  isAdmin: boolean;
}) {
  const auth = authNavLink({ nickname });

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
          {primaryNavLinks({ isAdmin }).map((link) => (
            <Link
              key={link.href}
              href={link.href}
              data-testid={`nav-${link.href.split("/")[1]}`}
              className="font-condensed text-[13px] font-bold uppercase tracking-wide text-bone no-underline transition hover:text-volt"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href={auth.href}
            className="rounded-control bg-volt px-[14px] py-2 font-condensed text-[13px] font-extrabold uppercase tracking-wide text-surface no-underline"
          >
            {auth.label}
          </Link>
        </nav>
      </div>
    </header>
  );
}
