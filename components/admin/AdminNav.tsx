"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminNavLinks } from "@/lib/nav/links";

/**
 * The admin section switcher.
 *
 * A client component for one reason: the current section is a function of the
 * pathname, and a server layout does not get one. Everything else about the
 * admin shell stays server-rendered and server-gated.
 *
 * Prefix matching rather than equality, so `/admin/games/<id>/edit` still shows
 * Games as current — an organizer three levels into a game should not see the
 * nav claim they are nowhere.
 */
export function AdminNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="flex flex-wrap gap-4">
      {adminNavLinks().map((link) => {
        const current = pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? "page" : undefined}
            data-testid={`admin-nav-${link.href.split("/")[2]}`}
            className={`font-mono text-[11px] uppercase tracking-eyebrow no-underline transition ${
              current
                ? "text-volt underline decoration-volt/40 underline-offset-[6px]"
                : "text-muted hover:text-volt"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
